import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "..", "..");
const excludedDirectories = new Set([".git", "dist", "native-dist", "node_modules"]);
const binaryExtensions = new Set([
  ".bmp", ".dmg", ".exe", ".gif", ".ico", ".jpeg", ".jpg", ".pdf", ".png", ".webp", ".zip",
]);

const forbidden = [
  { label: "private key", pattern: /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/ },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { label: "OpenAI-style secret key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { label: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/ },
  { label: "Slack token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { label: "private Windows user path", pattern: /[A-Z]:\\Users\\(?!(?:<you>|Example)(?:\\|["']))[^\s"'`]+/i },
  { label: "private macOS user path", pattern: /\/Users\/(?!(?:<you>|example)(?:\/|["']))[^\s"'`]+/ },
  { label: "private vault name", pattern: new RegExp(["Rawlings", "Second", "Brain"].join(""), "i") },
  { label: "legacy vault environment variable", pattern: new RegExp(["RAWLINGS", "SECOND", "BRAIN", "ROOT"].join("_")) },
  { label: "known private drive path", pattern: new RegExp(["G:", "\\\\My Drive", "\\\\inq"].join(""), "i") },
  { label: "known private email", pattern: new RegExp(["boomer", "@", "continuitydesk", ".io"].join(""), "i") },
];

function filesUnder(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(fullPath));
    else files.push(fullPath);
  }
  return files;
}

const findings = [];
for (const filePath of filesUnder(repositoryRoot)) {
  if (filePath === scriptPath || binaryExtensions.has(path.extname(filePath).toLowerCase())) continue;
  const bytes = fs.readFileSync(filePath);
  const relativePath = path.relative(repositoryRoot, filePath).replaceAll("\\", "/");
  if (bytes.includes(0)) {
    findings.push(`${relativePath}: contains a NUL byte`);
    continue;
  }
  const text = bytes.toString("utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(text)) findings.push(`${relativePath}: ${rule.label}`);
  }
}

if (findings.length) {
  console.error("PRIVACY SCAN FAILED");
  for (const finding of findings) console.error(`  - ${finding}`);
  process.exit(1);
}

console.log("PRIVACY SCAN PASS");
