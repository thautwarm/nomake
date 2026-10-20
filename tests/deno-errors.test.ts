import { test } from "node:test";
import assert from "node:assert/strict";
import { Path, NotFound, PermissionDenied, FileSystemError } from "../mod.ts";

test("native filesystem errors preserve Deno error classes", async () => {
  const root = await Deno.makeTempDir();
  try {
    const missing = new Path(`${root}/missing/file`);
    for (const action of [
      () => missing.readBytes(),
      () => missing.writeBytes(new Uint8Array([1])),
      () => missing.writeText("text"),
      () => missing.chmod(0o600),
      () => Array.fromAsync(missing.iterDir()),
      () => Array.fromAsync(missing.entries()),
    ]) await assert.rejects(action, (error) => error instanceof Deno.errors.NotFound);
    const file = new Path(`${root}/file`);
    await file.writeText("exists");
    await assert.rejects(() => file.writeText("new", { createNew: true }), (error) => error instanceof Deno.errors.AlreadyExists);
    await assert.rejects(() => Array.fromAsync(file.entries()), (error) => error instanceof Deno.errors.NotADirectory);
  } finally { await Deno.remove(root, { recursive: true }); }
});


test("NoMake filesystem types remain assignable to Deno errors", () => {
  const cause = new Error("original");
  const missing = new NotFound("missing", { cause });
  const nativeMissing: Deno.errors.NotFound = missing;
  const denied = new PermissionDenied("denied", { cause, code: "EPERM" });
  const nativeDenied: Deno.errors.PermissionDenied = denied;
  const common: FileSystemError = missing;
  assert.ok(nativeMissing instanceof Deno.errors.NotFound);
  assert.ok(nativeDenied instanceof Deno.errors.PermissionDenied);
  assert.ok(common instanceof FileSystemError);
});
