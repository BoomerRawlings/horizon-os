import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dashboard = path.resolve(here, "..");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "horizon-research-document-"));
const researchDir = path.join(temporaryRoot, "Research Papers");
const attachmentsDir = path.join(researchDir, "Attachments");
fs.mkdirSync(attachmentsDir, { recursive: true });
fs.mkdirSync(path.join(temporaryRoot, "00_System", "local", "Horizon"), { recursive: true });

const minimalPdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n", "ascii");
fs.writeFileSync(path.join(attachmentsDir, "Sample.pdf"), minimalPdf);
fs.writeFileSync(path.join(researchDir, "Sample-2026.md"), `---
type: research-paper
title: Sample paper
authors: Example, Alex
year: 2026
pdf_path: Attachments/Sample.pdf
---

Example, A. (2026). Sample paper.

## Summary

A route verification fixture.
`);

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["server.cjs"], {
  cwd: dashboard,
  env: {
    ...process.env,
    HORIZON_APP_DATA_DIR: path.join(temporaryRoot, "app-data"),
    HORIZON_APP_SOURCE_ROOT: path.resolve(dashboard, ".."),
    HORIZON_VAULT_ROOT: temporaryRoot,
    PORT: String(port),
    RSB_DISABLE_EXTERNAL_INTEGRATIONS: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) { ready = true; break; }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  assert.equal(ready, true, "test server should start");

  const libraryResponse = await fetch(`${origin}/api/research/papers`);
  assert.equal(libraryResponse.status, 200);
  const library = await libraryResponse.json();
  assert.equal(library.papers.length, 1);
  assert.equal(library.papers[0].documentAvailable, true);
  assert.match(library.papers[0].documentUrl, /^\/api\/research\/documents\//);
  assert.equal(library.papers[0].previewUrl, library.papers[0].documentUrl);

  const documentResponse = await fetch(`${origin}${library.papers[0].documentUrl}`);
  assert.equal(documentResponse.status, 200);
  assert.equal(documentResponse.headers.get("content-type"), "application/pdf");
  assert.equal(documentResponse.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.deepEqual(Buffer.from(await documentResponse.arrayBuffer()), minimalPdf);

  const rangeResponse = await fetch(`${origin}${library.papers[0].documentUrl}`, { headers: { Range: "bytes=0-3" } });
  assert.equal(rangeResponse.status, 206);
  assert.equal(rangeResponse.headers.get("content-range"), `bytes 0-3/${minimalPdf.length}`);
  assert.equal(Buffer.from(await rangeResponse.arrayBuffer()).toString("ascii"), "%PDF");

  const escaped = encodeURIComponent("vault:../package.json");
  assert.equal((await fetch(`${origin}/api/research/documents/${escaped}`)).status, 404);
  console.log("RESEARCH DOCUMENT ROUTE PASS");
} finally {
  child.kill();
  fs.rmSync(temporaryRoot, { force: true, recursive: true });
}
