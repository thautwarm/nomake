import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Node tests exercise its release bundle separately. This checks native Deno
// execution in a child with a restricted, explicitly named environment grant.
test("Deno shell inherits and overrides env without full env permission", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "nomake-deno-permissions-"));
  try
  {
    const script = path.join(directory, "restricted.ts");
    const module = new URL("../mod.ts", import.meta.url).href;
    await writeFile(script, `
import { Shell } from ${JSON.stringify(module)};
if ((await Deno.permissions.query({ name: "env" })).state === "granted")
  throw new Error("The child must not have full env permission");
const argv = [Deno.execPath(), "eval", 'console.log(Deno.env.get("NOMAKE_INHERITED_TEST"))'];
const inherited = await Shell.run(argv, { stdout: "capture" });
const overridden = await Shell.run(argv, {
  stdout: "capture",
  env: { NOMAKE_INHERITED_TEST: "override", NOMAKE_UNDEFINED: undefined },
});
console.log(JSON.stringify({ inherited, overridden }));
`);
    const args = [
      "run", "--no-config", "--no-prompt", "--allow-read",
      "--allow-env=PATH,NOMAKE_LOG_LEVEL,NOMAKE_NO_PARALLEL,NOMAKE_PROF",
    ];
    const result = await new Deno.Command(Deno.execPath(), {
      args: [...args, "--allow-run", script],
      env: { NOMAKE_INHERITED_TEST: "inherited" },
      stdout: "piped", stderr: "piped",
    }).output();
    assert.equal(result.code, 0, new TextDecoder().decode(result.stderr));
    const output = JSON.parse(new TextDecoder().decode(result.stdout));
    assert.deepEqual(output.inherited, { stdout: "inherited\n", stderr: "", success: true, errorcode: 0 });
    assert.deepEqual(output.overridden, { stdout: "override\n", stderr: "", success: true, errorcode: 0 });

    // A native permission failure must propagate, rather than retrying via Node.
    const denied = await new Deno.Command(Deno.execPath(), {
      args: [...args, script], stdout: "piped", stderr: "piped",
    }).output();
    assert.notEqual(denied.code, 0);
    assert.match(new TextDecoder().decode(denied.stderr), /Requires run access/);
  }
  finally
  {
    await rm(directory, { recursive: true, force: true });
  }
});
