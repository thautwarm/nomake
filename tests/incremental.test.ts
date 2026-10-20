import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, rm, readFile, writeFile, utimes, stat, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import * as NM from "../mod.ts";

function barrier() { return Promise.withResolvers<void>(); }
async function fixture(action: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), "nomake-incremental-"));
  const previous = process.env.NOMAKE_CACHE_DIR;
  process.env.NOMAKE_CACHE_DIR = path.join(root, "cache");
  try { await action(root); }
  finally {
    if (previous === undefined) delete process.env.NOMAKE_CACHE_DIR;
    else process.env.NOMAKE_CACHE_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
}
function record(root: string, name: string) {
  return path.join(root, "cache", "targets", NM.Encode.encodeB32(name));
}
const ioError = (code = "EACCES") => Object.assign(new Error(`injected ${code}`), { code });

// Each test uses unique target names; filesystem fault injection is scoped and restored.
test("incremental: stable cache, changed upstream output and stable rebuilt metadata", async () => fixture(async (root) => {
  const input = path.join(root, "input"); const upstream = path.join(root, "upstream"); const downstream = path.join(root, "downstream");
  await writeFile(input, "fixed input");
  let revision = 1; let downstreamBuilds = 0;
  const time = new Date(1700000000000);
  const producer = NM.target({ name: upstream, deps: [input], rebuild: "always", async build() {
    await writeFile(upstream, String(revision));
    await utimes(upstream, time, new Date(time.getTime() + revision * 1000));
  } });
  NM.target({ name: downstream, deps: { producer }, async build({ deps }) {
    downstreamBuilds++; await writeFile(downstream, await readFile(deps.producer));
  } });
  await NM.makefile([downstream]);
  await NM.makefile([downstream]);
  assert.equal(downstreamBuilds, 1, "same final metadata must not invalidate downstream");
  revision = 2;
  await NM.makefile([downstream]);
  assert.equal(downstreamBuilds, 2);
  assert.equal(await readFile(downstream, "utf8"), "2");
  producer.rebuild = "onChanged";
  let forbiddenBuilds = 0;
  producer.build = () => { forbiddenBuilds++; };
  await NM.makefile([downstream]);
  assert.equal(forbiddenBuilds, 0);
  assert.equal(downstreamBuilds, 2);
}));

test("incremental: diamond consumers share one job through final cache commit", async () => fixture(async (root) => {
  const shared = path.join(root, "shared"); const a = path.join(root, "a"); const b = path.join(root, "b");
  const committing = barrier(); const release = barrier();
  let builds = 0; let consumers = 0;
  NM.target({ name: shared, async build() { builds++; await writeFile(shared, "done"); } });
  for (const name of [a, b]) NM.target({ name, deps: [shared], virtual: true, build() { consumers++; } });
  const rename = fs.promises.rename;
  fs.promises.rename = async (from, to) => {
    if (String(to) === record(root, shared)) { committing.resolve(); await release.promise; }
    return await rename(from, to);
  };
  const runner = new NM.MakefileRunner();
  const first = runner.run(a); const second = runner.run(b);
  try {
    await committing.promise;
    assert.equal(builds, 1); assert.equal(consumers, 0);
    assert.equal(runner.builtTargets.has(shared), false);
    assert.equal(runner.buildingTargets.has(shared), true);
    assert.equal(runner.run(shared), runner.run(shared), "same promise must be returned");
    release.resolve();
    await Promise.all([first, second]);
  } finally {
    release.resolve();
    await Promise.allSettled([first, second]);
    fs.promises.rename = rename;
  }
  assert.equal(consumers, 2); assert.equal(builds, 1);
  assert.equal(runner.builtTargets.has(shared), true);
  assert.equal(runner.buildingTargets.size, 0);
}));

test("incremental: shared failure reaches every waiter and remains failed for this runner", async () => fixture(async (root) => {
  const shared = path.join(root, "shared"); const failure = new Error("shared failure");
  const started = barrier(); const release = barrier();
  let builds = 0; let consumers = 0;
  NM.target({ name: shared, virtual: true, async build() { builds++; started.resolve(); await release.promise; throw failure; } });
  const names = [path.join(root, "a"), path.join(root, "b")];
  for (const name of names) NM.target({ name, virtual: true, deps: [shared], build() { consumers++; } });
  const runner = new NM.MakefileRunner();
  const results = Promise.allSettled(names.map((name) => runner.run(name)));
  await started.promise; release.resolve();
  for (const result of await results) {
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") assert.equal(result.reason, failure);
  }
  assert.equal(builds, 1); assert.equal(consumers, 0);
  assert.equal(runner.builtTargets.has(shared), false);
  await assert.rejects(runner.run(shared), (error) => error === failure);
  assert.equal(builds, 1);
}));

test("incremental: failed forced rebuild revokes old record before leaving partial output", async () => fixture(async (root) => {
  const input = path.join(root, "input"); const output = path.join(root, "output");
  await writeFile(input, "input"); let builds = 0;
  const target = NM.target({ name: output, deps: [input], async build() { builds++; await writeFile(output, "complete"); } });
  await NM.makefile([output]);
  const old = await stat(output);
  target.rebuild = "always";
  target.build = async () => {
    await writeFile(output, "partial!");
    await utimes(output, old.atime, old.mtime);
    throw new Error("failed rebuild");
  };
  await assert.rejects(NM.makefile([output]), /failed rebuild/);
  assert.equal(await readFile(output, "utf8"), "partial!");
  await assert.rejects(readFile(record(root, output)), { code: "ENOENT" });
  target.rebuild = "onChanged";
  target.build = async () => { builds++; await writeFile(output, "repaired"); };
  await NM.makefile([output]);
  assert.equal(builds, 2); assert.equal(await readFile(output, "utf8"), "repaired");
}));

test("incremental: record revocation failure leaves old output and success record untouched", async () => fixture(async (root) => {
  const output = path.join(root, "output"); let builds = 0;
  NM.target({ name: output, async build() { builds++; await writeFile(output, "complete"); } });
  await NM.makefile([output]);
  const previous = await readFile(record(root, output)); const unlink = fs.promises.unlink;
  fs.promises.unlink = async (name) => {
    if (String(name) === record(root, output)) throw ioError();
    return await unlink(name);
  };
  try { await assert.rejects(NM.makefile([output]), { code: "EACCES" }); }
  finally { fs.promises.unlink = unlink; }
  assert.equal(builds, 1); assert.equal(await readFile(output, "utf8"), "complete");
  assert.deepEqual(await readFile(record(root, output)), previous);
}));

test("incremental: failed final commit leaves no success record or running consumer", async () => fixture(async (root) => {
  const output = path.join(root, "output"); const consumer = path.join(root, "consumer");
  let consumers = 0;
  NM.target({ name: output, async build() { await writeFile(output, "complete"); } });
  NM.target({ name: consumer, virtual: true, deps: [output], build() { consumers++; } });
  const rename = fs.promises.rename;
  fs.promises.rename = async (from, to) => {
    if (String(to) === record(root, output)) throw ioError("EIO");
    return await rename(from, to);
  };
  const runner = new NM.MakefileRunner();
  try { await assert.rejects(runner.run(consumer), { code: "EIO" }); }
  finally { fs.promises.rename = rename; }
  assert.equal(consumers, 0); assert.equal(runner.builtTargets.has(output), false);
  await assert.rejects(readFile(record(root, output)), { code: "ENOENT" });
  assert.deepEqual(await readdir(path.join(root, "cache", "targets")), []);
}));

test("incremental: failure drains already started sibling work before makefile returns", async () => fixture(async (root) => {
  const started = barrier(); const failed = barrier(); const release = barrier();
  let completed = false; let returned = false;
  const slow = NM.target({ name: path.join(root, "slow"), virtual: true, async build() {
    started.resolve(); await release.promise; completed = true;
  } });
  const bad = NM.target({ name: path.join(root, "bad"), virtual: true, async build() {
    await started.promise; failed.resolve(); throw new Error("expected failure");
  } });
  const rootTarget = NM.target({ name: path.join(root, "root"), virtual: true, deps: [bad, slow] });
  const pending = NM.makefile([rootTarget.name]).then(() => { returned = true; }, (error) => { returned = true; throw error; });
  const rejection = assert.rejects(pending, /expected failure/);
  try {
    await failed.promise;
    assert.equal(returned, false); assert.equal(completed, false);
  } finally { release.resolve(); await rejection; }
  assert.equal(completed, true);
}));

test("incremental: makefile checks changed inputs, factories refresh and concrete generators retain snapshots", async () => fixture(async (root) => {
  const input = path.join(root, "input"); const other = path.join(root, "other"); const output = path.join(root, "output");
  await writeFile(input, "1"); await writeFile(other, "2");
  let deps = [input]; let evaluations = 0; let builds = 0;
  NM.target({ name: output, deps: () => { evaluations++; return deps; }, async build({ deps }) { builds++; await writeFile(output, deps.join(",")); } });
  await NM.makefile([output]);
  await writeFile(input, "longer");
  await NM.makefile([output]);
  assert.equal(builds, 2);
  deps = [input, other]; await NM.makefile([output]);
  assert.equal(evaluations, 3); assert.equal(builds, 3);
  assert.equal(await readFile(output, "utf8"), deps.join(","));
  async function* once() { yield input; }
  const fixed = NM.target({ name: path.join(root, "fixed"), virtual: true, deps: once() });
  const snapshot = await fixed.evalDeps();
  await NM.makefile([fixed.name]); await NM.makefile([fixed.name]);
  assert.deepEqual(await fixed.evalDeps(), snapshot);
}));

test("incremental: cache hits and dependency failure do not revoke parent records; never stays unchanged", async () => fixture(async (root) => {
  const input = path.join(root, "input"); const output = path.join(root, "output");
  await writeFile(input, "input");
  const producer = NM.target({ name: input, rebuild: "never" });
  let builds = 0;
  const parent = NM.target({ name: output, deps: [producer], async build() { builds++; await writeFile(output, "old"); } });
  await NM.makefile([output]);
  const previous = await readFile(record(root, output));
  const unlink = fs.promises.unlink; let revocations = 0;
  fs.promises.unlink = async (name) => { if (String(name) === record(root, output)) revocations++; return await unlink(name); };
  try {
    await NM.makefile([output]); assert.equal(revocations, 0); assert.equal(builds, 1);
    producer.rebuild = "always"; producer.build = () => { throw new Error("dependency failure"); };
    await assert.rejects(NM.makefile([output]), /dependency failure/);
    assert.equal(revocations, 0);
    assert.deepEqual(await readFile(record(root, output)), previous);
  } finally { fs.promises.unlink = unlink; }
  const existing = path.join(root, "existing"); await writeFile(existing, "preserve");
  NM.target({ name: existing, rebuild: "never", build() { throw new Error("must not run"); } });
  await NM.makefile([existing]);
  assert.equal(await readFile(existing, "utf8"), "preserve");
}));

test("incremental: metadata and cache read I/O failures propagate before actions", async () => fixture(async (root) => {
  const output = path.join(root, "output"); let builds = 0;
  NM.target({ name: output, async build() { builds++; await writeFile(output, "output"); } });
  const original = fs.promises.stat;
  fs.promises.stat = (async (...args: Parameters<typeof original>) => {
    if (String(args[0]) === output) throw ioError("EIO");
    return await original(...args);
  }) as typeof original;
  try { await assert.rejects(NM.makefile([output]), { code: "EIO" }); }
  finally { fs.promises.stat = original; }
  assert.equal(builds, 0);
  await NM.makefile([output]);
  fs.promises.stat = (async (...args: Parameters<typeof original>) => {
    if (String(args[0]) === record(root, output)) throw ioError();
    return await original(...args);
  }) as typeof original;
  try { await assert.rejects(NM.makefile([output]), { code: "EACCES" }); }
  finally { fs.promises.stat = original; }
  assert.equal(builds, 1);
}));


test("incremental: atomic temporary filenames do not lengthen encoded target names", async () => fixture(async (root) => {
  const name = path.join(root, "x".repeat(Math.max(1, 140 - root.length - 1)));
  NM.target({ name, async build() { await writeFile(name, "output"); } });
  await NM.makefile([name]);
  assert.equal((await readFile(record(root, name), "utf8")).length > 0, true);
}));

test("incremental: partial cache write is never published as a success record", async () => fixture(async (root) => {
  const output = path.join(root, "output");
  NM.target({ name: output, async build() { await writeFile(output, "complete"); } });
  await NM.makefile([output]);
  const open = fs.promises.open;
  fs.promises.open = (async (...args: Parameters<typeof open>) => {
    const file = await open(...args);
    if (String(args[0]).endsWith(".tmp") && String(args[0]).startsWith(path.join(root, "cache", "targets"))) {
      const write = file.writeFile.bind(file);
      file.writeFile = async () => { await write("incomplete"); throw ioError("ENOSPC"); };
    }
    return file;
  }) as typeof open;
  try { await assert.rejects(NM.makefile([output]), { code: "ENOSPC" }); }
  finally { fs.promises.open = open; }
  await assert.rejects(readFile(record(root, output)), { code: "ENOENT" });
  assert.deepEqual(await readdir(path.join(root, "cache", "targets")), []);
  await NM.makefile([output]);
  assert.equal((await readFile(record(root, output), "utf8")).length > 0, true);
}));


test("incremental: scoped dependency factories keep their Target receiver", async () => {
  const target = new NM.Target("receiver", undefined, "onChanged", function(this: NM.Target) {
    return [this.name + ".input"];
  }, false);
  assert.deepEqual((await target.evalDeps({})).deps, ["receiver.input"]);
  assert.deepEqual((await target.evalDeps()).deps, ["receiver.input"]);
});

test("incremental: concurrent sessions share the complete initial generator snapshot", async () => {
  const release = barrier(); let consumed = 0;
  async function* deps() { consumed++; yield "a"; await release.promise; yield "b"; }
  const target = new NM.Target("shared-snapshot", undefined, "onChanged", deps(), true);
  const first = target.evalDeps({}); const second = target.evalDeps({});
  release.resolve();
  const values = await Promise.all([first, second]);
  assert.equal(consumed, 1);
  assert.deepEqual(values[0].deps, ["a", "b"]);
  assert.equal(values[0], values[1]);
  assert.equal(await target.evalDeps(), values[0]);
});


test("incremental: unscoped factory failures can retry without losing the Target receiver", async () => {
  let calls = 0;
  const target = new NM.Target("retry-factory", undefined, "onChanged", function(this: NM.Target) {
    if (++calls === 1) throw new Error("retry once");
    return [this.name + ".input"];
  }, true);
  await assert.rejects(target.evalDeps(), /retry once/);
  assert.deepEqual((await target.evalDeps()).deps, ["retry-factory.input"]);
});

test("incremental: final metadata failure blocks consumers and leaves no success record", async () => fixture(async (root) => {
  const output = path.join(root, "output"); let produced = false; let consumers = 0;
  NM.target({ name: output, async build() { await writeFile(output, "complete"); produced = true; } });
  const consumer = NM.target({ name: path.join(root, "consumer"), virtual: true, deps: [output], build() { consumers++; } });
  const original = fs.promises.stat;
  fs.promises.stat = (async (...args: Parameters<typeof original>) => {
    if (String(args[0]) === output && produced) throw ioError("EIO");
    return await original(...args);
  }) as typeof original;
  try { await assert.rejects(NM.makefile([consumer.name]), { code: "EIO" }); }
  finally { fs.promises.stat = original; }
  assert.equal(consumers, 0);
  await assert.rejects(readFile(record(root, output)), { code: "ENOENT" });
}));

test("incremental: corrupt and legacy cache records cause conservative rebuilds", async () => fixture(async (root) => {
  const input = path.join(root, "input"); const output = path.join(root, "output");
  await writeFile(input, "input"); let builds = 0;
  NM.target({ name: output, deps: [input], async build() { builds++; await writeFile(output, "output"); } });
  await NM.makefile([output]);
  for (const corrupt of ["invalid base64@@", NM.Encode.encodeB64(new Uint8Array(16))]) {
    await writeFile(record(root, output), corrupt);
    await NM.makefile([output]);
    const replacement = await readFile(record(root, output), "utf8");
    assert.notEqual(replacement, corrupt);
    assert.equal(NM.Encode.decodeB64(replacement).length, 16);
  }
  assert.equal(builds, 3);
}));
