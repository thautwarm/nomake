import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repository = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(path.join(tmpdir(), "nomake-package-"));
const npm = process.env.npm_execpath;
assert.ok(npm, "Run this verification using npm run test:package");

function run(command: string, args: string[], cwd: string)
{
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, npm_config_userconfig: path.join(directory, "empty.npmrc") },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

try
{
  await writeFile(path.join(directory, "empty.npmrc"), "");
  const packages = JSON.parse(run(process.execPath, [npm, "pack", "--ignore-scripts", "--json", "--pack-destination", directory], repository));
  assert.equal(packages.length, 1);
  const entries: string[] = packages[0].files.map((file: { path: string }) => file.path);
  assert.ok(entries.includes("dist/index.js") && entries.includes("dist/index.d.ts"));
  assert.ok(entries.includes("dist/THIRD_PARTY_LICENSES.txt"));
  assert.ok(entries.includes("ChangeLog.md"));
  assert.ok(entries.every((entry) => entry.startsWith("dist/") || ["package.json", "LICENSE", "README.md", "ChangeLog.md"].includes(entry)));

  const consumer = path.join(directory, "consumer");
  await mkdir(consumer);
  await writeFile(path.join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
  run(process.execPath, [npm, "install", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org", path.join(directory, packages[0].filename)], consumer);
  const installed = path.join(consumer, "node_modules", "@nomake", "core");
  const metadata = JSON.parse(await readFile(path.join(installed, "package.json"), "utf8"));
  assert.equal(metadata.name, "@nomake/core");
  assert.equal(metadata.version, "0.2.0");
  assert.equal(Object.keys(metadata.dependencies ?? {}).length, 0);

  // Inspect real import expressions; documentation comments may mention JSR packages.
  for (const filename of ["index.js", "index.d.ts"])
  {
    const source = ts.createSourceFile(filename, await readFile(path.join(installed, "dist", filename), "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node)
    {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
        assert.ok(node.moduleSpecifier.text.startsWith("node:"), `External dependency in ${filename}: ${node.moduleSpecifier.text}`);
      if (ts.isCallExpression(node) && node.arguments.length && ts.isStringLiteral(node.arguments[0]))
      {
        const callee = node.expression.getText(source);
        if (callee === "import" || /require/i.test(callee))
          assert.ok(node.arguments[0].text.startsWith("node:"), `External require in ${filename}: ${node.arguments[0].text}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }

  await writeFile(path.join(consumer, "input.txt"), "consumer");
  await writeFile(path.join(consumer, "build.ts"), `
import * as NM from "@nomake/core";
import assert from "node:assert/strict";
import process from "node:process";
NM.option("GREETING", ({ value }) => { assert.equal(value, "hello"); });
NM.parseOptions();
NM.target({ name: "output.txt", deps: { input: "input.txt" }, async build({ deps, target }) {
  const text: string = await new NM.Path(deps.input).readText();
  await new NM.Path(target).writeText(text.toUpperCase());
} });
await NM.makefile();
assert.equal(await new NM.Path("output.txt").readText(), "CONSUMER");
assert.deepEqual(await Array.fromAsync(NM.Path.glob("*.txt", { includeDirs: false })), ["input.txt", "output.txt"]);
const child = await NM.Shell.run([process.execPath, "-e", "console.log('child')"], { stdout: "capture" });
assert.equal(child.stdout, "child\\n");
assert.equal(child.success, true);
assert.equal(NM.SemVer.format(NM.version), "0.2.0");
assert.equal(NM.SemVer.format(NM.SemVer.rangeMin(NM.SemVer.parseRange(">=1.2.3 <2.0.0"))), "1.2.3");
assert.equal(NM.SemVer.format(NM.SemVer.increment(NM.SemVer.parse("1.2.3"), "prerelease", "beta")), "1.2.4-beta.0");
await assert.rejects(new NM.Path("missing-file.txt").readBytes(), (error) => {
  assert.ok(error instanceof NM.NotFound);
  assert.ok(error instanceof NM.FileSystemError);
  assert.equal(error.code, "ENOENT");
  assert.ok(error.cause instanceof Error);
  assert.notEqual(error.stack, error.cause.stack);
  return true;
});
console.log("package fixture passed");
`);
  const first = run(process.execPath, ["build.ts", "-DGREETING=hello", "output.txt"], consumer);
  assert.match(first, /package fixture passed/);
  const second = run(process.execPath, ["build.ts", "-DGREETING=hello", "output.txt"], consumer);
  assert.match(second, /skipping output.txt/);

  // Type-check the installed declarations without skipLibCheck or workspace dependencies.
  run(process.execPath, [npm, "install", "--save-dev", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org", "typescript@~5.9.2", "@types/node@^24"], consumer);
  await writeFile(path.join(consumer, "type-tests.ts"), `
import { target, Path, SemVer, NotFound, PermissionDenied, FileSystemError, type FileSystemErrorOptions, type TargetParams } from "@nomake/core";
const generator = target({ name: "generated.txt" });
target({ name: "check", deps: { source: "input.ts", generated: generator, many: [generator, "more.ts"] }, build({ deps }) {
  const input: string = deps.source;
  const generated: string = deps.generated;
  const many: string[] = deps.many;
  // @ts-expect-error dependency names must be preserved
  deps.missing;
  // @ts-expect-error a named source resolves to a string, not an array
  const wrong: string[] = deps.source;
  void [input, generated, many, wrong];
} });
const options: TargetParams<string[]> = { name: "typed", deps: ["a"] };
void options;
const stats = await new Path("input.txt").stat();
const isFile: boolean = stats.isFile();
void isFile;
const prerelease: SemVer.SemVer = SemVer.increment(SemVer.parse("1.2.3"), "prerelease", "beta");
const minimum: SemVer.SemVer = SemVer.rangeMin(SemVer.parseRange(">=1.2.3 <2.0.0"));
void [prerelease, minimum];
const cause = new Error("original");
const errorOptions: FileSystemErrorOptions = { cause, code: "EPERM" };
const permission: FileSystemError = new PermissionDenied("denied", errorOptions);
const missing: FileSystemError = new NotFound("missing", { cause });
function narrow(error: unknown): string | number | undefined {
  if (error instanceof NotFound) {
    const original: unknown = error.cause;
    const general: FileSystemError = error;
    void [original, general];
    return error.code;
  }
  if (error instanceof FileSystemError) return error.code;
  return undefined;
}
void [permission, missing, narrow];
`);
  run(process.execPath, [path.join(consumer, "node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--target", "ESNext", "--module", "NodeNext", "--types", "node", "build.ts", "type-tests.ts"], consumer);
  console.log(`Verified npm tarball on ${process.version}: isolated install, native build.ts, cache, glob, shell, declarations and dependency inference.`);
}
finally
{
  await rm(directory, { recursive: true, force: true });
}
