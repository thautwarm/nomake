export * from "./source/log.ts";
export * from "./source/build.ts";
export * from "./source/pathlib.ts";
export * from "./source/platform.ts";
export * from "./source/shell.ts";
export * from "./source/env.ts";
export * from "./source/repo.ts";
export * from "./source/web.ts";
import * as Bflat from "./source/toolchains/bflat.ts";
import * as CC from "./source/toolchains/cc.ts";

import { Glob, SemVer } from "./deps.ts";

export
{
  /**
   * The Bflat toolchain used to build
   * C# projects on Windows, Linux, and UEFI.
   */
  Bflat,
  /**
   * The C/C++ compiler toolchain.
   */
  CC,
  /**
   * The Glob module from Deno standard library.
   */
  Glob,
  /**
   * SemVer module from Deno standard library.
   */
  SemVer,
};
export { autoReadFile, exit, never, urlToValidFileName, inOptions } from "./source/utils.ts";

export const version = SemVer.parse("0.1.12");