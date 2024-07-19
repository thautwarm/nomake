import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as NM from "./mod.ts";

Deno.test("url test", () => {
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
  ) {
    assertEquals(NM.fixDllPath(p, NM.Platform.currentOS), NM.fixHostDllPath(p));
    assertEquals(NM.fixExePath(p, NM.Platform.currentOS), NM.fixHostExePath(p));
  }
});
