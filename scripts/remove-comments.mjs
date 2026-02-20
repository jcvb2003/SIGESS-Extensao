import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

function getProjectRoot() {
  const urlPath = new URL(import.meta.url).pathname;
  const decodedPath = decodeURIComponent(urlPath);
  const normalizedPath =
    process.platform === "win32" && decodedPath.startsWith("/")
      ? decodedPath.slice(1)
      : decodedPath;
  return path.resolve(path.dirname(normalizedPath), "..");
}

const projectRoot = getProjectRoot();
const srcDir = path.join(projectRoot, "src");

function isCodeFile(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.endsWith(".d.ts")) return false;
  return /\.(ts|tsx|js|jsx)$/.test(normalized);
}

function collectFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (isCodeFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function removeComments(filePath) {
  const code = fs.readFileSync(filePath, "utf-8");

  // Mantemos formatação básica lendo e re-emitindo com impressora do TS
  const sourceFile = ts.createSourceFile(
    filePath,
    code,
    ts.ScriptTarget.Latest,
    true, // setParentNodes
    filePath.endsWith(".tsx") || filePath.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const printer = ts.createPrinter({
    removeComments: true,
    newLine: ts.NewLineKind.LineFeed,
  });

  const result = printer.printFile(sourceFile);
  fs.writeFileSync(filePath, result, "utf-8");
}

console.log("Starting comment removal...");
const files = collectFiles(srcDir);
let modifiedCount = 0;

for (const file of files) {
  try {
    removeComments(file);
    modifiedCount++;
    console.log(`Processed: ${path.relative(projectRoot, file)}`);
  } catch (error) {
    console.error(`Error processing ${file}:`, error);
  }
}

console.log(`\nFinished! Processed ${modifiedCount} files.`);
