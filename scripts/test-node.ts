import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const directory = path.resolve(".nomake_files/node-tests");
await mkdir(directory, { recursive: true });
const entry = JSON.stringify(pathToFileURL(path.resolve("dist/index.js")).href);
const outputs: string[] = [];
for (const [index, filename] of ["test.ts", "tests/compat.test.ts", "tests/incremental.test.ts", "tests/filesystem-errors.test.ts"].entries())
{
  // Node tests consume the release bundle; only test files need TS erasure.
  const source = (await readFile(filename, "utf8"))
    .replace(/(["'])(?:\.\/|\.\.\/)mod\.ts\1/g, entry);
  const result = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
  });
  const output = path.join(directory, `${index}.test.mjs`);
  await writeFile(output, result.outputText);
  outputs.push(output);
}
const result = spawnSync(process.execPath, ["--test", ...outputs], { stdio: "inherit" });
if (result.error) throw result.error;
assert.equal(result.status, 0, "Node bundle behavior tests failed");
