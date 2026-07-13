import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dashboardDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageMetadata = JSON.parse(fs.readFileSync(path.join(dashboardDir, "package.json"), "utf8"));
const distDir = path.join(dashboardDir, "dist");

function git(args, fallback = "unknown") {
  try {
    return execFileSync("git", ["-C", dashboardDir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function sourceIsDirty() {
  const status = git(["status", "--porcelain", "--", "."], "");
  return status
    .split(/\r?\n/)
    .filter(Boolean)
    .some((line) => {
      const filePath = line.slice(3).split(" -> ").pop().replace(/\\/g, "/");
      return !filePath.startsWith("dist/") && !filePath.startsWith("native-dist/");
    });
}

function rendererAsset() {
  try {
    const html = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
    return html.match(/assets\/index-[^"']+\.js/)?.[0] || "unknown";
  } catch {
    return "unknown";
  }
}

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(
  path.join(distDir, "build-info.json"),
  `${JSON.stringify({
    commit: process.env.HORIZON_BUILD_COMMIT || git(["rev-parse", "HEAD"]),
    dirty: sourceIsDirty(),
    renderer: rendererAsset(),
    version: String(packageMetadata.version || "unknown"),
  }, null, 2)}\n`,
  "utf8",
);
