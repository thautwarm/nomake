import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as NM from "./mod.ts";
import { allPromisesUnderLimitedParallelism } from "./source/compat.ts";
import { assertThrows } from "https://deno.land/std@0.224.0/assert/assert_throws.ts";

Deno.test("url test", () =>
{
  assertEquals(NM.isLinuxSharedLib("a.so.8"), true);
  assertEquals(NM.fixDllPath("a.so.8", "linux"), "a.so.8");
  assertEquals(NM.fixDllPath("a.so.a", "linux"), "a.so.a.so");
  assertEquals(NM.fixDllPath("a", "windows"), "a.dll");
  assertEquals(NM.fixDllPath("a.k.so", "linux"), "a.k.so");
  assertEquals(NM.fixDllPath("a.k", "linux"), "a.k.so");
  assertEquals(NM.fixDllPath("aasdsadas", "linux"), "aasdsadas.so");
  assertEquals(NM.fixDllPath("a.k", "macos"), "a.k.dylib");
  assertEquals(NM.fixDllPath("a.k.dylib", "macos"), "a.k.dylib");

  for (
    const p in [
      "a.k",
      "a.k.dll",
      "a.k.so",
      "a.k.dylib",
      "a",
      "a.exe",
      "a.so",
      "a.so.8",
      "a.k.so.8",
      "a.dylib",
    ]
  )
  {
    assertEquals(NM.fixDllPath(p, NM.Platform.currentOS), NM.fixHostDllPath(p));
    assertEquals(NM.fixExePath(p, NM.Platform.currentOS), NM.fixHostExePath(p));
  }
});

Deno.test('limited parallelism', async () =>
{
  assertEquals(await allPromisesUnderLimitedParallelism({
    tasks: [], limit: 1
  }), []);

  async function test1(): Promise<number>
  {
    // wait for 1 seconds
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return 1;
  }
  {
    const t0 = performance.now();
    assertEquals(
      await allPromisesUnderLimitedParallelism({ tasks: [test1, test1, test1, test1], limit: 2 }),
      [1, 1, 1, 1],
    );
    const t1 = performance.now();
    assertEquals((t1 - t0) < 2500 && (t1 - t0) > 2000, true);
  }
  {
    const t0 = performance.now();
    assertEquals(
      await allPromisesUnderLimitedParallelism(
        {
          tasks: [
            test1,
            test1,
            test1,
            test1,
            test1,
          ], limit: 2
        }),
      [1, 1, 1, 1, 1],
    );
    const t1 = performance.now();
    assertEquals((t1 - t0) < 3500 && (t1 - t0) > 3000, true);
  }
});

Deno.test('path literal', () =>
{
  const base = NM.Path.cwd();
  assertEquals(NM.p`${base}/a/b/c/d`.asPosix(), NM.Path.cwd().join("a", "b", "c", "d").asPosix())

  {
    const pa = 'a/';
    const pb = 'b/';
    assertEquals(NM.p`${pa}/b/${pb}/`.asPosix(), new NM.Path(pa).join("b", pb).asPosix())
  }

  {
    const pa = 'a';
    const pb = 'b';
    assertEquals(NM.p`${pa}/${pb}`.asPosix(), NM.p`${pa}${pb}`.asPosix());
  }

  {
    const pa = 'a';
    const pb = '/b';
    assertEquals(NM.p`${pb}/b`.asPosix(), '/b/b');
    assertThrows(() => NM.p`/${pa}${pb}`)
    assertEquals(NM.p`/${pa + pb}`.asPosix(), '/a/b');
  }
});