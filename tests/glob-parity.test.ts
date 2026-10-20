import { test } from "node:test";
import assert from "node:assert/strict";
import * as original from "https://deno.land/std@0.224.0/fs/expand_glob.ts";
import { walk as oldWalk, walkSync as oldWalkSync } from "https://deno.land/std@0.224.0/fs/walk.ts";
import * as current from "../vendor/deno-std/expand_glob.ts";
import { walk, walkSync } from "../vendor/deno-std/walk.ts";

// Differential tests run in Deno; shared contract tests also exercise the Node bundle.
test("vendored traversal agrees with std@0.224.0 for unchanged parser cases", async () => {
  const root = await Deno.realPath(await Deno.makeTempDir());
  try {
    for (const name of ["sub/deep", "empty"]) await Deno.mkdir(`${root}/${name}`, { recursive: true });
    for (const name of ["a.ts", "!a.ts", "foo.ts", "foo.test.ts", "[test].ts", ".hidden.ts", "sub/b.ts", "sub/deep/c.ts"])
      await Deno.writeTextFile(`${root}/${name}`, "");
    if (Deno.build.os !== "windows") await Deno.symlink(`${root}/sub`, `${root}/link`);
    const patterns = ["", ".", "./", "*", "**", "**/*", "**/", "sub/**", "sub/**/*.ts", "**/../*.ts", "sub/../*.ts", "a.ts/", "!a.ts", "{a,foo}.ts", "!(foo).ts", "[!a]*.ts", "link", "link/**", "link/*", "missing/**"];
    const options: current.ExpandGlobOptions[] = [{}, { includeDirs: false }, { globstar: false }, { extended: false }, { caseInsensitive: true }, { exclude: ["sub/"] }, { exclude: ["!a.ts"] }, { followSymlinks: true }, { followSymlinks: true, canonicalize: false }];
    for (const pattern of patterns) for (const option of options) {
      const config = { root, ...option };
      const expected = [...original.expandGlobSync(pattern, config)];
      assert.deepEqual([...current.expandGlobSync(pattern, config)], expected, JSON.stringify({ pattern, option }));
      assert.deepEqual(await Array.fromAsync(current.expandGlob(pattern, config)), await Array.fromAsync(original.expandGlob(pattern, config)), JSON.stringify({ pattern, option }));
    }
    const sort = (entries: original.WalkEntry[]) => entries.sort((a, b) => a.path.localeCompare(b.path));
    for (const option of [{}, { maxDepth: 0 }, { maxDepth: 1 }, { includeDirs: false }, { includeFiles: false }, { includeSymlinks: false }, { followSymlinks: true }, { followSymlinks: true, canonicalize: false }, { skip: [/sub/] }, { exts: [".ts"] }]) {
      assert.deepEqual(sort([...walkSync(root, option)]), sort([...oldWalkSync(root, option)]));
      assert.deepEqual(sort(await Array.fromAsync(walk(root, option))), sort(await Array.fromAsync(oldWalk(root, option))));
    }
  } finally { await Deno.remove(root, { recursive: true }); }
});
