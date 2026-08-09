import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_LINES = 600;
const root = fileURLToPath(new URL("../", import.meta.url));
const ignoredDirectories = new Set([
  ".git",
  ".wrangler",
  "coverage",
  "dist",
  "node_modules",
]);
const ignoredFiles = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);
const codeExtensions = new Set([
  ".astro", ".bat", ".c", ".cc", ".cjs", ".cmd", ".cpp", ".cs", ".css",
  ".cxx", ".go", ".h", ".hpp", ".html", ".java", ".js", ".json", ".jsonc",
  ".jsx", ".kt", ".kts", ".less", ".mjs", ".php", ".ps1", ".py", ".rb",
  ".rs", ".sass", ".scss", ".sh", ".svelte", ".swift", ".toml", ".ts",
  ".tsx", ".vue", ".yaml", ".yml",
]);

async function collectCodeFiles(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...await collectCodeFiles(join(directory, entry.name)));
      continue;
    }
    if (!entry.isFile() || ignoredFiles.has(entry.name)) continue;
    if (codeExtensions.has(extname(entry.name).toLocaleLowerCase())) files.push(join(directory, entry.name));
  }
  return files;
}

function countPhysicalLines(content) {
  if (!content) return 0;
  const lines = content.split(/\r\n|\r|\n/).length;
  return /(?:\r\n|\r|\n)$/.test(content) ? lines - 1 : lines;
}

const files = await collectCodeFiles(root);
const violations = [];
let largest = { path: "", lines: 0 };

for (const path of files) {
  const lines = countPhysicalLines(await readFile(path, "utf8"));
  const displayPath = relative(root, path).replaceAll("\\", "/");
  if (lines > largest.lines) largest = { path: displayPath, lines };
  if (lines > MAX_LINES) violations.push({ path: displayPath, lines });
}

if (violations.length) {
  console.error(`Code files must not exceed ${MAX_LINES} physical lines:`);
  violations
    .sort((left, right) => right.lines - left.lines)
    .forEach(({ path, lines }) => console.error(`- ${path}: ${lines} lines`));
  process.exitCode = 1;
} else {
  console.log(`Checked ${files.length} code files. Largest: ${largest.path} (${largest.lines}/${MAX_LINES} lines).`);
}
