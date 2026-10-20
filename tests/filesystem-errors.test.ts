import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, rm, symlink, mkdir, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import * as NoMake from "../mod.ts";

const nativeErrors = (globalThis as { Deno?: { errors: Record<string, new (...args: never[]) => Error> } }).Deno?.errors;
async function capture(action: () => unknown | PromiseLike<unknown>): Promise<NoMake.FileSystemError> {
  try { await action(); }
  catch (error) {
    assert.ok(error instanceof NoMake.FileSystemError);
    assert.ok(error instanceof Error);
    assert.ok(error.cause instanceof Error);
    assert.notEqual(error, error.cause);
    assert.equal(typeof error.stack, "string");
    assert.equal(typeof error.cause.stack, "string");
    return error;
  }
  throw new Error("Expected a filesystem failure");
}
function own(error: NoMake.FileSystemError, Constructor: new (...args: never[]) => Error, nativeName: string, code: string) {
  assert.ok(error instanceof Constructor);
  assert.equal(error.name, nativeName);
  assert.equal(error.code, code);
  if (nativeErrors?.[nativeName]) assert.ok(error instanceof nativeErrors[nativeName]);
}

test("filesystem errors: real failures have shared classes, codes, original causes and independent stacks", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nomake-errors-"));
  try {
    const missing = new NoMake.Path(path.join(root, "missing/file"));
    for (const action of [
      () => missing.readBytes(), () => missing.readText(), () => missing.stat(),
      () => missing.writeBytes(new Uint8Array([1])), () => missing.writeText("text"),
      () => missing.chmod(0o600), () => Array.fromAsync(missing.entries()),
      () => Array.fromAsync(missing.iterDir()),
      () => missing.mkdir({ onError: "existOk" }),
      () => missing.copyTo(path.join(root, "copy")),
      () => NoMake.autoReadFile(missing.asOsPath()),
    ]) own(await capture(action), NoMake.NotFound, "NotFound", "ENOENT");
    const file = new NoMake.Path(path.join(root, "file"));
    await file.writeText("exists");
    own(await capture(() => file.writeText("new", { createNew: true })), NoMake.AlreadyExists, "AlreadyExists", "EEXIST");
    own(await capture(() => Array.fromAsync(file.entries())), NoMake.NotADirectory, "NotADirectory", "ENOTDIR");
    const badSource = new NoMake.Path(path.join(root, "file/child"));
    own(await capture(() => badSource.stat()), NoMake.NotADirectory, "NotADirectory", "ENOTDIR");
  } finally { await rm(root, { recursive: true, force: true }); }
});

function originalFailure(code?: string | number) { return Object.assign(new Error("original filesystem failure"), { code }); }

test("filesystem errors: preserve EACCES, EPERM and unknown codes, exact cause identity and both stacks", async () => {
  const stat = fs.promises.stat;
  try {
    for (const code of ["EACCES", "EPERM", "EIO", "ENOSPC", "constructor", 123, undefined]) {
      const original = originalFailure(code);
      const originalStack = original.stack;
      fs.promises.stat = (async () => { throw original; }) as typeof stat;
      const error = await capture(() => new NoMake.Path("injected").stat());
      assert.equal(error.cause, original);
      assert.equal(error.cause.stack, originalStack);
      assert.equal(error.code, code);
      assert.notEqual(error.stack, originalStack);
      assert.match(originalStack!, /originalFailure/);
      assert.doesNotMatch(error.stack!, /at originalFailure/);
      if (code === "EACCES" || code === "EPERM") own(error, NoMake.PermissionDenied, "PermissionDenied", code);
      else {
        assert.equal(error.constructor, NoMake.FileSystemError);
        assert.equal(error.name, "FileSystemError");
        assert.equal(error instanceof NoMake.NotFound, false);
      }
    }
  } finally { fs.promises.stat = stat; }
});

test("filesystem errors: preserve already normalized identity and mkdir/rm callback errors", async () => {
  const cause = originalFailure("ENOENT");
  const converted = new NoMake.NotFound("converted", { cause });
  const stat = fs.promises.stat;
  fs.promises.stat = (async () => { throw converted; }) as typeof stat;
  try { assert.equal(await capture(() => new NoMake.Path("injected").stat()), converted); }
  finally { fs.promises.stat = stat; }
  const mkdir = fs.promises.mkdir; const remove = fs.promises.rm;
  fs.promises.mkdir = (async () => { throw cause; }) as typeof mkdir;
  fs.promises.rm = async () => { throw cause; };
  try {
    let callbacks = 0;
    const onError = (error: unknown) => {
      assert.ok(error instanceof NoMake.NotFound); assert.equal(error.cause, cause); callbacks++;
    };
    await new NoMake.Path("injected").mkdir({ onError });
    await new NoMake.Path("injected").rm({ onError });
    assert.equal(callbacks, 2);
  } finally { fs.promises.mkdir = mkdir; fs.promises.rm = remove; }
});

test("filesystem errors: synchronous and asynchronous glob traversal preserve NoMake errors", { skip: process.platform === "win32" }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nomake-glob-errors-"));
  try {
    await symlink(path.join(root, "missing"), path.join(root, "broken"));
    const options = { root, followSymlinks: true };
    own(await capture(() => Array.fromAsync(NoMake.Glob.expandGlob("*", options))), NoMake.NotFound, "NotFound", "ENOENT");
    own(await capture(() => [...NoMake.Glob.expandGlobSync("*", options)]), NoMake.NotFound, "NotFound", "ENOENT");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("filesystem errors: dependency and action exceptions retain their own identity", async () => {
  const error = new Error("user failure");
  const action = NoMake.target({ name: "user-action-error", virtual: true, build() { throw error; } });
  await assert.rejects(new NoMake.MakefileRunner().run(action.name), (caught) => caught === error);
  const dependency = NoMake.target({ name: "user-dependency-error", virtual: true, deps() { throw error; } });
  await assert.rejects(new NoMake.MakefileRunner().run(dependency.name), (caught) => caught === error);
});


test("filesystem errors: pre-cancelled writes consistently wrap the original reason", async () => {
  const controller = new AbortController();
  const reason = new Error("cancelled by caller"); controller.abort(reason);
  const error = await capture(() => new NoMake.Path("not-created-after-abort").writeBytes(new Uint8Array(), { signal: controller.signal }));
  assert.equal(error.constructor, NoMake.FileSystemError);
  assert.equal(error.cause, reason);
  assert.notEqual(error.stack, reason.stack);
});

test("filesystem errors: cache initialization retains its permission code and cause", async () => {
  const mkdir = fs.promises.mkdir;
  const original = originalFailure("EPERM");
  fs.promises.mkdir = (async () => { throw original; }) as typeof mkdir;
  try {
    const error = await capture(() => new NoMake.MakefileRunner()._assureCacheDir());
    own(error, NoMake.PermissionDenied, "PermissionDenied", "EPERM");
    assert.equal(error.cause, original);
  } finally { fs.promises.mkdir = mkdir; }
});


test("filesystem errors: actual OS access denial retains EACCES and Deno inheritance", { skip: process.platform === "win32" || process.getuid?.() === 0 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nomake-permission-"));
  const denied = path.join(root, "denied");
  await mkdir(denied); await writeFile(path.join(denied, "file"), "text");
  try {
    await chmod(denied, 0);
    const error = await capture(() => new NoMake.Path(path.join(denied, "file")).readBytes());
    own(error, NoMake.PermissionDenied, "PermissionDenied", "EACCES");
    assert.equal((error.cause as NodeJS.ErrnoException).code, "EACCES");
  } finally { await chmod(denied, 0o700); await rm(root, { recursive: true, force: true }); }
});

test("filesystem errors: cache directory pointing to a file raises a NoMake error", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nomake-cache-file-"));
  try {
    const file = path.join(root, "file"); await writeFile(file, "text");
    const runner = new NoMake.MakefileRunner();
    runner._cacheHome = new NoMake.Path(file); runner._cacheTargetDir = new NoMake.Path(path.join(file, "targets"));
    const error = await capture(() => runner._assureCacheDir());
    own(error, NoMake.AlreadyExists, "AlreadyExists", "EEXIST");
  } finally { await rm(root, { recursive: true, force: true }); }
});
