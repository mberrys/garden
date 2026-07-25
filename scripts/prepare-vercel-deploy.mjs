import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "test-results",
  "playwright-report",
  ".vercel",
  "artifacts",
]);
const SKIP_FILES = new Set(["tsconfig.tsbuildinfo"]);

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walk(full));
      continue;
    }
    if (SKIP_FILES.has(entry)) continue;
    if (entry.endsWith(".test.ts")) continue;
    if (entry.endsWith(".spec.ts")) continue;
    if (relative(ROOT, full).startsWith("e2e/")) continue;
    if (["vitest.config.ts", "playwright.config.ts"].includes(entry)) continue;
    files.push(full);
  }
  return files;
}

const BINARY_EXT = new Set([".ico", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".woff", ".woff2"]);

const files = walk(ROOT)
  .map((abs) => {
    const file = relative(ROOT, abs).replaceAll("\\", "/");
    const ext = file.slice(file.lastIndexOf("."));
    const binary = BINARY_EXT.has(ext);
    const data = readFileSync(abs);
    return {
      file,
      data: binary ? data.toString("base64") : data.toString("utf8"),
      ...(binary ? { encoding: "base64" } : {}),
    };
  })
  .filter((entry) => !entry.file.startsWith("scripts/record-document-demo.mjs"));

process.stdout.write(JSON.stringify(files));
