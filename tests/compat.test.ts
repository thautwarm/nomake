import { test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { mkdtemp, rm, mkdir, writeFile, symlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as NM from "../mod.ts";

async function temporary(action: (root: NM.Path) => Promise<void>)
{
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "nomake-compat-")));
  try { await action(new NM.Path(root)); }
  finally { await rm(root, { recursive: true, force: true }); }
}

function runtime(script: string)
{
  // Deno can execute the same JS fixture using eval; Node uses -e.
  const code = `import process from "node:process"; ${script}`;
  return [process.execPath, ...(path.basename(process.execPath).startsWith("deno") ? ["eval", code] : ["--input-type=module", "-e", code])];
}

test("encoding, semver and platform", () => {
  for (const text of ["", "hello", "你好 🌏"])
  {
    assert.equal(NM.Encode.decodeUtf8(NM.Encode.decodeB32(NM.Encode.encodeB32(text))), text);
    assert.equal(NM.Encode.decodeUtf8(NM.Encode.decodeB64(NM.Encode.encodeB64(text))), text);
  }
  assert.equal(NM.SemVer.format(NM.SemVer.parse("1.2.3")), "1.2.3");
  assert.equal(NM.SemVer.format(NM.SemVer.rangeMin(NM.SemVer.parseRange(">=1.2.3 <2.0.0"))), "1.2.3");
  assert.equal(NM.SemVer.format(NM.SemVer.increment(NM.SemVer.parse("1.2.3"), "prerelease", "beta")), "1.2.4-beta.0");
  assert.equal(NM.Platform.currentOS, process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : process.platform);
});

test("environment defaults, empty values and deletion", () => {
  const key = "NOMAKE_COMPAT_TEST_ENV";
  const previous = process.env[key];
  try {
    delete process.env[key];
    const env = NM.Env.create({ [key]: "default" });
    assert.equal(env[key], "default");
    env[key] = "";
    assert.equal(process.env[key], "");
    env[key] = undefined; assert.equal(process.env[key], undefined);
    env[key] = "value"; assert.equal(env[key], "value");
    env[key] = undefined; assert.equal(process.env[key], undefined);
  } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
});

test("file writes preserve create, createNew, append, encoding and bytes", async () => temporary(async (root) => {
  const file = root.join("data.txt");
  await assert.rejects(() => file.writeText("missing", { create: false }), { code: "ENOENT" });
  await file.writeText("a", { createNew: true });
  await assert.rejects(() => file.writeText("replace", { createNew: true }), { code: "EEXIST" });
  await file.writeText("b", { append: true, create: false });
  assert.equal(await file.readText(), "ab");
  await file.writeText("c", { create: false }); assert.equal(await file.readText(), "c");
  await file.writeText("你好", "utf16le"); assert.equal(await file.readText("utf16le"), "你好");
  await file.writeBytes(new Uint8Array([0, 128, 255]));
  assert.deepEqual([...await file.readBytes()], [0, 128, 255]);
  assert.deepEqual(await Array.fromAsync(root.entries()), [{ name: "data.txt", isDir: false, isFile: true }]);
  assert.equal((await Array.fromAsync(root.iterDir()))[0].asOsPath(), file.asOsPath());
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => file.writeText("abort", { signal: controller.signal }));
  assert.deepEqual([...await file.readBytes()], [0, 128, 255]);
  if (process.platform !== "win32")
  {
    await file.chmod(0o600);
    assert.equal((await file.stat()).mode & 0o777, 0o600);
  }
}));

test("readBytes returns Uint8Array with independent slices", async () => temporary(async (root) => {
  const file = root.join("bytes.bin");
  await file.writeBytes(new Uint8Array([1, 2, 3]));
  const original = await file.readBytes();
  assert.equal(original.constructor, Uint8Array);
  const copy = original.slice();
  copy[0] = 99;
  assert.deepEqual([...original], [1, 2, 3]);
  assert.deepEqual([...copy], [99, 2, 3]);
}));

test("explicit write modes apply to new and existing files", { skip: process.platform === "win32" }, async () => temporary(async (root) => {
  const file = root.join("existing.txt");
  await file.writeText("public");
  await file.chmod(0o644);
  await file.writeText("private", { mode: 0o600 });
  assert.equal((await file.stat()).mode & 0o777, 0o600);
  assert.equal(await file.readText(), "private");
  await file.writeBytes(new Uint8Array([65]), { append: true, create: false, mode: 0o640 });
  assert.equal((await file.stat()).mode & 0o777, 0o640);
  assert.equal(await file.readText(), "privateA");

  // Deno's node:process shim does not implement the umask setter in 2.5.6.
  const deno = (globalThis as { Deno?: { umask(mask: number): number } }).Deno;
  const umask = (mask: number) => deno ? deno.umask(mask) : process.umask(mask);
  const previous = umask(0o077);
  try
  {
    const created = root.join("created.txt");
    await created.writeText("explicit", { createNew: true, mode: 0o666 });
    assert.equal((await created.stat()).mode & 0o777, 0o666);
    const defaultMode = root.join("default.txt");
    await defaultMode.writeText("default");
    assert.equal((await defaultMode.stat()).mode & 0o777, 0o600);
  }
  finally { umask(previous); }
}));

test("glob roots, directories, hidden files, exclusions, sync and symlinks", async () => temporary(async (root) => {
  await mkdir(root.join("sub").asOsPath());
  for (const name of ["a.ts", ".hidden.ts", "sub/b.ts", "sub/c.txt"])
    await writeFile(root.join(name).asOsPath(), name);
  const files = await Array.fromAsync(root.glob("**/*.ts", { exclude: ["sub/**"] }));
  assert.deepEqual(files.sort(), [".hidden.ts", "a.ts"]);
  const options = { root: root.asOsPath(), includeDirs: false };
  const asyncEntries = await Array.fromAsync(NM.Glob.expandGlob("**/*", options));
  assert.deepEqual([...NM.Glob.expandGlobSync("**/*", options)], asyncEntries);
  assert.ok(asyncEntries.every((entry) => path.isAbsolute(entry.path) && entry.isFile));
  assert.ok((await Array.fromAsync(NM.Glob.expandGlob("*", { root: root.asOsPath() }))).some((entry) => entry.isDirectory));
  if (process.platform !== "win32") {
    await symlink(root.join("sub").asOsPath(), root.join("link").asOsPath());
    assert.ok(!(await Array.fromAsync(root.glob("**/*.ts"))).includes("link/b.ts"));
    assert.deepEqual(await Array.fromAsync(root.glob("link/*.ts")), ["link/b.ts"]);
    assert.deepEqual(await Array.fromAsync(root.glob("link/*.ts", { followSymlinks: true })), ["link/b.ts"]);
    await symlink(root.join("a.ts").asOsPath(), root.join("file-link").asOsPath());
    const [entry] = await Array.fromAsync(NM.Glob.expandGlob("file-link", { root: root.asOsPath(), followSymlinks: true, canonicalize: false }));
    assert.equal(entry.path, root.join("file-link").asOsPath());
    assert.equal(entry.isFile, true);
    assert.deepEqual([...NM.Glob.expandGlobSync("file-link", { root: root.asOsPath(), followSymlinks: true, canonicalize: false })], [entry]);
  }
}));

test("glob directory exclusions prune subtrees with or without a trailing slash", async () => temporary(async (root) => {
  await mkdir(root.join("sub", "nested").asOsPath(), { recursive: true });
  for (const name of ["a.ts", "sub/b.ts", "sub/nested/c.ts"])
    await writeFile(root.join(name).asOsPath(), "");
  for (const pattern of ["sub", "sub/", "sub///", root.join("sub").asOsPath() + path.sep])
  {
    const options = { root: root.asOsPath(), exclude: [pattern] };
    assert.deepEqual((await Array.fromAsync(NM.Glob.expandGlob("**/*", options))).map((entry) => entry.name), ["a.ts"]);
    assert.deepEqual([...NM.Glob.expandGlobSync("**/*", options)].map((entry) => entry.name), ["a.ts"]);
    assert.deepEqual(await Array.fromAsync(root.glob("**/*.ts", { exclude: [pattern] })), ["a.ts"]);
  }
  for (const exclude of [["*/"], ["*"]])
  {
    const options = { root: root.asOsPath(), exclude };
    assert.deepEqual(await Array.fromAsync(NM.Glob.expandGlob("**/*", options)), []);
    assert.deepEqual([...NM.Glob.expandGlobSync("**/*", options)], []);
  }
}));

test("literal symlink directories respect includeDirs without enabling traversal", { skip: process.platform === "win32" }, async () => temporary(async (root) => {
  await mkdir(root.join("sub").asOsPath());
  await mkdir(root.join("container").asOsPath());
  await writeFile(root.join("target.txt").asOsPath(), "target");
  await symlink(root.join("sub").asOsPath(), root.join("link").asOsPath());
  await symlink(root.join("sub").asOsPath(), root.join("container", "link").asOsPath());
  await symlink(root.join("target.txt").asOsPath(), root.join("file-link").asOsPath());
  await symlink(root.join("absent").asOsPath(), root.join("broken").asOsPath());
  for (const followSymlinks of [false, true])
  for (const caseInsensitive of [false, true])
  {
    const options = { root: root.asOsPath(), includeDirs: false, followSymlinks, caseInsensitive };
    for (const pattern of ["link", "link/", root.join("link").asOsPath()])
    {
      assert.deepEqual(await Array.fromAsync(NM.Glob.expandGlob(pattern, options)), []);
      assert.deepEqual([...NM.Glob.expandGlobSync(pattern, options)], []);
    }
    if (!followSymlinks)
    {
      // Wildcard paths retain the old walker's unfollowed link classification.
      const links = await Array.fromAsync(NM.Glob.expandGlob("*/link", options));
      assert.equal(links.length, 1);
      assert.equal(links[0].isSymlink, true);
      assert.equal(links[0].isDirectory, false);
      assert.deepEqual([...NM.Glob.expandGlobSync("*/link", options)], links);
    }
    const files = await Array.fromAsync(NM.Glob.expandGlob("file-link", options));
    assert.equal(files.length, 1);
    assert.equal(files[0].isFile, true);
    assert.equal(files[0].isSymlink, false);
    assert.equal(files[0].path, root.join("file-link").asOsPath());
    assert.deepEqual([...NM.Glob.expandGlobSync("file-link", options)], files);
    assert.deepEqual(await Array.fromAsync(NM.Glob.expandGlob("broken", options)), []);
    assert.deepEqual([...NM.Glob.expandGlobSync("broken", options)], []);
  }
}));

test("shell quoting, capture, ignore, cwd, environment and nonzero exit", async () => temporary(async (root) => {
  const args = ["command", "a b", "a'b", "", "中文"];
  assert.deepEqual(NM.Shell.split(NM.Shell.join(args)), args);
  const result = await NM.Shell.run(runtime('console.log(process.cwd()); console.log(process.env.NOMAKE_CHILD); console.error("error"); process.exit(7)'), {
    cwd: root.asOsPath(), env: { NOMAKE_CHILD: "child" }, stdout: "capture",
  });
  assert.equal(result.success, false); assert.equal(result.errorcode, 7);
  assert.equal(result.stdout, `${root.asOsPath()}\nchild\n`); assert.equal(result.stderr, "error\n");
  const ignored = await NM.Shell.run(runtime('console.log("out"); console.error("err")'), { stdout: "ignore" });
  assert.deepEqual(ignored, { stdout: "", stderr: "", success: true, errorcode: 0 });
  await assert.rejects(() => NM.Shell.runChecked(runtime('process.exit(3)'), { stdout: "capture" }), /code 3/);
  await assert.rejects(() => NM.Shell.run(["nomake-command-does-not-exist-123"]), /Command not found/);
  if (process.platform !== "win32") {
    const signaled = await NM.Shell.run(runtime('process.kill(process.pid, "SIGTERM")'), { stdout: "capture" });
    assert.equal(signaled.success, false); assert.equal(signaled.errorcode, 143);
  }
}));

test("tasks preserve named dependency arguments, success caching and failure", async () => temporary(async (root) => {
  const cache = process.env.NOMAKE_CACHE_DIR;
  process.env.NOMAKE_CACHE_DIR = root.join("cache").asOsPath();
  try {
    const input = root.join("input.txt"); const output = root.join("output.txt");
    await input.writeText("hello"); let builds = 0;
    NM.target({ name: output.relativeTo(NM.Path.cwd()), deps: { input: input.asOsPath() }, async build({ deps, target }) {
      builds++; await new NM.Path(target).writeText(await new NM.Path(deps.input).readText());
    } });
    await new NM.MakefileRunner().run(output.relativeTo(NM.Path.cwd()));
    await new NM.MakefileRunner().run(output.relativeTo(NM.Path.cwd()));
    assert.equal(builds, 1); assert.equal(await output.readText(), "hello");
    const failing = root.join("failing").asOsPath();
    NM.target({ name: failing, virtual: true, build() { throw new Error("expected failure"); } });
    await assert.rejects(() => new NM.MakefileRunner().run(failing), /expected failure/);
  } finally { if (cache === undefined) delete process.env.NOMAKE_CACHE_DIR; else process.env.NOMAKE_CACHE_DIR = cache; }
}));

test("download creates parent directories and saves bytes", async () => temporary(async (root) => {
  const file = root.join("nested", "download.txt");
  await NM.Web.download({ url: "data:text/plain,hello%20world", path: file, noPrint: true });
  assert.equal(await file.readText(), "hello world");
}));

test("file logging appends and removing a transport stops writes", async () => temporary(async (root) => {
  const file = root.join("build.log");
  const transport = NM.Log.addTransport(file);
  try
  {
    NM.Log.msg("first message", "compat");
    NM.Log.msg("second message", "compat");
  } finally { NM.Log.rmTransport(transport); }
  const contents = await file.readText();
  assert.match(contents, /\[compat\]: first message\n/);
  assert.match(contents, /\[compat\]: second message\n/);
  NM.Log.msg("after removal", "compat");
  assert.equal(await file.readText(), contents);
}));

test("vendored glob preserves root, literal, parent and globstar semantics", async () => temporary(async (root) => {
  const directory = root.asOsPath();
  await mkdir(path.join(directory, "sub/deep"), { recursive: true });
  for (const name of ["a.ts", "!a.ts", "[test].ts", "sub/b.ts", "sub/deep/c.ts"])
    await writeFile(path.join(directory, name), "");
  const cases: [string, NM.Glob.ExpandGlobOptions, string[]][] = [
    ["", {}, [""]],
    ["**", {}, ["", "!a.ts", "[test].ts", "a.ts", "sub", "sub/b.ts", "sub/deep", "sub/deep/c.ts"]],
    ["sub/**", {}, ["sub", "sub/b.ts", "sub/deep", "sub/deep/c.ts"]],
    ["a.ts/", {}, []],
    ["!a.ts", {}, ["!a.ts"]],
    ["[[]test].ts", {}, []],
    ["@(a).ts", {}, ["a.ts"]],
    ["*.ts", { exclude: ["!a.ts"] }, ["[test].ts", "a.ts"]],
    ["sub/**/*.ts", { globstar: false }, ["sub/b.ts", "sub/deep/c.ts"]],
    ["**/../*.ts", {}, ["!a.ts", "[test].ts", "a.ts", "sub/b.ts"]],
  ];
  for (const [pattern, options, expected] of cases) {
    const config = { root: directory, ...options };
    const actual = await Array.fromAsync(NM.Glob.expandGlob(pattern, config));
    assert.deepEqual(actual.map((entry) => path.relative(directory, entry.path).split(path.sep).join("/")), expected, pattern);
    assert.deepEqual([...NM.Glob.expandGlobSync(pattern, config)], actual, pattern);
  }
}));

test("vendored glob canonicalizes descendants of followed directory symlinks", { skip: process.platform === "win32" }, async () => temporary(async (root) => {
  const directory = root.asOsPath();
  await mkdir(path.join(directory, "sub/deep"), { recursive: true });
  await writeFile(path.join(directory, "sub/deep/c.ts"), "");
  await symlink(path.join(directory, "sub"), path.join(directory, "link"));
  const options = { root: directory, followSymlinks: true };
  const actual = await Array.fromAsync(NM.Glob.expandGlob("**/*", options));
  assert.ok(actual.every((entry) => !path.relative(directory, entry.path).startsWith("link")));
  assert.ok(actual.every((entry) => !entry.isSymlink));
  assert.ok(actual.some((entry) => entry.path === path.join(directory, "sub/deep/c.ts")));
  assert.deepEqual([...NM.Glob.expandGlobSync("**/*", options)], actual);
}));
