import * as NM from "../../mod.ts";

// compute endianess
const IsBE = new Uint16Array(new Uint8Array([0x12, 0x34]).buffer)[0] === 0x1234;
const ENDIANESS = IsBE ? "big" : "little";
const DEFAULT_GLIBC_VERSION = "2.17";
const DEFAULT_CC_OPTIMIZATION_LEVEL = 2;

export type ZigTarget =
  // 64-bit
  | { target: "x86_64-linux-gnu"; glibc: string }
  | { target: "x86_64-linux-musl" }
  | { target: "aarch64-linux-gnu"; glibc: string }
  | { target: "aarch64-linux-musl" }
  | { target: "aarch64_be-linux-gnu"; glibc: string }
  | { target: "aarch64_be-linux-musl" }
  | { target: "x86_64-windows-gnu" }
  | { target: "aarch64-macos-none" }
  | { target: "x86_64-macos-none" }
  // 32-bit
  | { target: "x86-windows-gnu" }
  | { target: "x86-linux-gnu"; glibc: string }
  | { target: "x86-linux-musl" }
  | { target: "arm-linux-gnueabi" } // glibc version optional?
  | { target: "arm-linux-musleabi" }
  | { target: "arm-linux-gnueabihf" }
  | { target: "arm-linux-musleabihf" }
  | { target: "armeb-linux-gnueabi" } // glibc version optional?
  | { target: "armeb-linux-musleabi" }
  | { target: "armeb-linux-gnueabihf" }
  | { target: "armeb-linux-musleabihf" };

export type CCOptions =
  | {
    os?: NM.OS;
    arch?: Exclude<NM.Arch, "arm">;
    endianness?: "little" | "big";
    libc?: "glibc" | "musl";
    glibcVersion?: string;
    hardfloat?: undefined;
  }
  | {
    os: "linux";
    arch: "arm";
    endianness: "little" | "big";
    libc?: "glibc" | "musl";
    hardfloat: boolean;
    glibcVersion?: undefined;
  };

export class ZigToolchain
{
  os: NM.OS;
  arch: NM.Arch;
  endianness: "little" | "big";
  libc?: "glibc" | "musl";
  glibcVersion?: string;
  hardfloat?: boolean;
  targetStruct: ZigTarget;
  target: string;

  constructor(options?: CCOptions)
  {
    this.os = options?.os ?? NM.Platform.currentOS;
    this.arch = options?.arch ?? NM.Platform.currentArch;
    this.endianness = options?.endianness ?? ENDIANESS;
    this.libc = options?.libc;
    this.glibcVersion = options?.glibcVersion;
    this.hardfloat = options?.hardfloat;
    this.targetStruct = this.computeTarget();
    if ("glibc" in this.targetStruct)
    {
      this.target = `${this.targetStruct.target}.${this.targetStruct.glibc}`;
    } else
    {
      this.target = this.targetStruct.target;
    }
  }

  private computeTarget(): ZigTarget
  {
    const { arch, os, endianness } = this;

    switch (os)
    {
      case "macos": {
        if (this.arch === "x64")
        {
          return { target: "x86_64-macos-none" };
        } else if (this.arch === "arm64")
        {
          return { target: "aarch64-macos-none" };
        } else
        {
          throw new Error(`Unsupported macOS arch ${arch}`);
        }
      }
      case "windows": {
        if (this.arch === "x64")
        {
          return { target: "x86_64-windows-gnu" };
        } else if (this.arch === "x86")
        {
          return { target: "x86-windows-gnu" };
        } else
        {
          throw new Error(`Unsupported Windows arch ${arch}`);
        }
      }
      case "linux": {
        const libc = this.libc ?? "glibc";
        const libcVersion = this.glibcVersion ?? DEFAULT_GLIBC_VERSION;

        switch (arch)
        {
          case "x86": {
            if (libc == "glibc")
            {
              return { target: "x86-linux-gnu", glibc: libcVersion };
            }
            return { target: "x86-linux-musl" };
          }
          case "x64": {
            if (libc == "glibc")
            {
              return { target: "x86_64-linux-gnu", glibc: libcVersion };
            }

            return { target: "x86_64-linux-musl" };
          }
          case "arm64": {
            if (endianness == "little")
            {
              if (libc == "glibc")
              {
                return { target: "aarch64-linux-gnu", glibc: libcVersion };
              }
              return { target: "aarch64-linux-musl" };
            } else
            {
              if (libc == "glibc")
              {
                return { target: "aarch64_be-linux-gnu", glibc: libcVersion };
              }
              return { target: "aarch64_be-linux-musl" };
            }
          }
          case "arm": {
            const hardfloat = this.hardfloat;
            if (hardfloat === undefined)
            {
              throw new Error("hardfloat must be specified for arm target");
            }

            if (endianness == "little")
            {
              if (hardfloat)
              {
                if (libc == "glibc")
                {
                  return { target: "arm-linux-gnueabihf" };
                }
                return { target: "arm-linux-musleabihf" };
              } else
              {
                if (libc == "glibc")
                {
                  return { target: "arm-linux-gnueabi" };
                }
                return { target: "arm-linux-musleabi" };
              }
            } else
            {
              if (hardfloat)
              {
                if (libc == "glibc")
                {
                  return { target: "armeb-linux-gnueabihf" };
                }
                return { target: "armeb-linux-musleabihf" };
              } else
              {
                if (libc == "glibc")
                {
                  return { target: "armeb-linux-gnueabi" };
                }
                return { target: "armeb-linux-musleabi" };
              }
            }
          }
          default:
            assertNever(arch.unknownStr, "arch");
        }
        break;
      }
      default:
        assertNever(os.unknownStr, "os");
    }
  }
}

// deno-lint-ignore no-explicit-any
function assertNever(x: any, tag: string): never
{
  throw new Error(`Unexpected ${tag}: ${x}`);
}

// TODO:
// 1. add support for static library
// 2. it is possible to link to a subcompilation
//    export type CLinkLib =
//     | { kind: 'subcompile', compilation: Compilation, libname: str }
export type CLinkLib =
  | { kind: "path"; path: string }
  | { kind: "name"; name: string };

export type CMakeProjectOptions = {
  name: string;
  mode: "shared" | "exe";
  dest: string;
};

/**
 * A C compilation can produce
 * (1) a static library (TODO)
 * (2) a shared library
 * (3) an executable
 * (4) a makefile project
 */
export class Compilation
{
  sources: string[];
  includeDirs: string[];
  libraryDirs: string[];
  linkLibs: CLinkLib[];
  cflags: string[];
  optimizationLevel: 0 | 1 | 2 | 3;
  cpp?: "c++11" | "c++14" | "c++17" | "c++20";

  constructor()
  {
    this.sources = [];
    this.includeDirs = [];
    this.libraryDirs = [];
    this.cflags = [];
    this.linkLibs = [];
    this.cpp = undefined;
    this.optimizationLevel = DEFAULT_CC_OPTIMIZATION_LEVEL;
  }

  compileSharedLib(dest: string, compiler: CCompiler): Promise<void>
  {
    return compiler.compileSharedLib(this, dest);
  }

  compileExe(dest: string, compiler: CCompiler): Promise<void>
  {
    return compiler.compileExe(this, dest);
  }

  async dumpCmake(options: CMakeProjectOptions)
  {
    const destPath = new NM.Path(options.dest);
    destPath.mkdir({
      parents: true,
      onError: "existOk",
    });

    const sourceFilesAgg = this.sources.map((x) =>
      aggFile(
        x,
        TAG_SOURCE_FILE,
      )
    );

    const includeDirsAgg = this.includeDirs.map((x) =>
      aggDir(
        x,
        "copy",
        TAG_INCLUDE_DIR,
      )
    );
    const libraryDirsAgg = this.libraryDirs.map((x) =>
      aggDir(
        x,
        "copy",
        TAG_LIBRARY_DIR,
      )
    );
    const aggregated = aggregatePath([
      ...sourceFilesAgg,
      ...includeDirsAgg,
      ...libraryDirsAgg,
    ]);

    const sourcesFromRoot: string[] = [];
    const includeDirsFromRoot: string[] = [];
    const libraryDirsFromRoot: string[] = [];

    async function toFS(agg: AggregatedPath, sec: string[])
    {
      const destEach = destPath.join(...sec);
      switch (agg.kind)
      {
        case "file": {
          const sourceContent = await new NM.Path(agg.path).readText();
          await destEach.writeText(sourceContent);
          if (hasFlag(agg.tag, TAG_SOURCE_FILE))
          {
            sourcesFromRoot.push(sec.join("/"));
          }
          break;
        }
        case "dir": {
          const content = agg.content;
          if (content == "copy")
          {
            await new NM.Path(agg.path).copyTo(destEach, {
              contentsOnly: true,
            });
          } else
          {
            await destEach.mkdir({
              parents: true,
              onError: "existOk",
            });

            for (const [k, v] of content.entries())
            {
              await toFS(v, [...sec, k]);
            }
          }

          if (hasFlag(agg.tag, TAG_INCLUDE_DIR))
          {
            includeDirsFromRoot.push(sec.join("/"));
          }

          if (hasFlag(agg.tag, TAG_LIBRARY_DIR))
          {
            libraryDirsFromRoot.push(sec.join("/"));
          }
        }
      }
    }
    const tasks = new Array(aggregated.length);
    let _includeDir_cnt = 0;
    let _libraryDir_cnt = 0;
    let _otherDir_cnt = 0;

    // TODO: warn directories that are both libdir and includedir
    for (let i = 0; i < aggregated.length; i++)
    {
      if (hasFlag(aggregated[i].tag, TAG_INCLUDE_DIR))
      {
        const dirname = `include${_includeDir_cnt++}`;
        tasks[i] = toFS(aggregated[i], [dirname]);
      } else if (hasFlag(aggregated[i].tag, TAG_LIBRARY_DIR))
      {
        const dirname = `lib${_libraryDir_cnt++}`;
        tasks[i] = toFS(aggregated[i], [dirname]);
      } else if (aggregated[i].kind == "file")
      {
        throw new Error(
          `Unexpected file processing in make project: ${aggregated[i].path}`,
        );
      } else
      {
        const dirname = `misc${_otherDir_cnt++}`;
        tasks[i] = toFS(aggregated[i], [dirname]);
      }
    }
    for (const t of tasks)
    {
      await t;
    }

    await destPath.join("CMakeLists.txt").writeText(
      Array.from(
        this.genCmake(
          sourcesFromRoot,
          includeDirsFromRoot,
          libraryDirsFromRoot,
          options,
        ),
      ).join("\n"),
    );
  }

  private *genCmake(
    sourcesFromRoot: string[],
    includeDirsFromRoot: string[],
    libraryDirsFromRoot: string[],
    options: CMakeProjectOptions,
  )
  {
    yield `# you may run this script with: cmake -S . -B build -G "Unix Makefiles" && cmake --build build`;
    yield "cmake_minimum_required(VERSION 3.5)";
    yield `project(${options.name}Proj)`;

    yield `set(CMAKE_C_STANDARD 99)`;
    if (this.cpp)
    {
      yield `set(CMAKE_CXX_STANDARD ${this.cpp})`;
    }

    // add compile_commands.json
    yield "set(CMAKE_EXPORT_COMPILE_COMMANDS ON)";

    if (options.mode == "exe")
    {
      yield `add_executable(${options.name}`;
      for (const s of sourcesFromRoot)
      {
        yield `    ${s}`;
      }
    } else
    {
      yield `add_library(${options.name} SHARED`;
      for (const s of sourcesFromRoot)
      {
        yield `    ${s}`;
      }
    }
    yield ")";

    if (includeDirsFromRoot.length != 0)
    {
      yield `target_include_directories(${options.name}`;
      yield "    PUBLIC";
      for (const include of includeDirsFromRoot)
      {
        yield `    ${include}`;
      }
      yield ")";
    }

    // copy?
    // if (libraryDirsFromRoot.length != 0)
    // {
    //     yield `target_link_directories(${options.name}`
    //     yield '    PUBLIC'
    //     for (const libraryDir of libraryDirsFromRoot)
    //     {
    //         yield `    ${libraryDir}`
    //     }
    //     yield ')'
    // }

    // add cflags

    yield `target_compile_options(${options.name}`;
    yield "    PUBLIC";
    yield `    -O${this.optimizationLevel}`;
    for (const cflag of this.cflags)
    {
      yield `    ${cflag}`;
    }
    yield ")";

    // add link libraries
    if (this.linkLibs.length != 0)
    {
      yield `target_link_libraries(${options.name}`;
      yield "    PUBLIC";
      for (const lib of this.linkLibs)
      {
        if (lib.kind == "path")
        {
          yield `    ${lib.path}`;
        } else
        {
          yield `    ${lib.name}`;
        }
      }
      yield ")";
    }
  }
}

export abstract class CCompiler
{
  ccoptions?: CCOptions;

  abstract compileSharedLib(
    compilation: Compilation,
    dest: string,
  ): Promise<void>;
  abstract compileExe(compilation: Compilation, dest: string): Promise<void>;
}

export type CCTag =
  | 0b001 // sourceFile
  | 0b010 // includeDir
  | 0b100; // libraryDir

const TAG_SOURCE_FILE: CCTag = 0b001;
const TAG_INCLUDE_DIR: CCTag = 0b010;
const TAG_LIBRARY_DIR: CCTag = 0b100;

function hasFlag(x: number, bit: number): boolean
{
  return (x & bit) === bit;
}

export class GCC extends CCompiler
{
  override async compileExe(compilation: Compilation, dest: string)
  {
    if (this.ccoptions !== undefined)
    {
      NM.Log.warn(
        `nomake.cToolchain GCC/G++ rule sets so far do not support target options,` +
        `it uses the current platform's default settings.`,
        "nomake.cToolchain",
      );
    }

    await this.nativeCompile(compilation, dest, "exe");
  }

  override async compileSharedLib(compilation: Compilation, dest: string)
  {
    if (this.ccoptions !== undefined)
    {
      NM.Log.warn(
        `nomake.cToolchain GCC/G++ rule sets so far do not support target options,` +
        `it uses the current platform's default settings.`,
        "nomake.cToolchain",
      );
    }

    await this.nativeCompile(compilation, dest, "shared");
  }

  async nativeCompile(
    compilation: Compilation,
    dest: string,
    mode: "shared" | "exe",
  )
  {
    const argv: string[] = [];
    if (compilation.cpp)
    {
      // check g++ or CXX
      const gPlusPlus = await NM.Shell.which("g++");
      if (!gPlusPlus)
      {
        NM.Log.error("g++ not found", "nomake.cToolchain");
        NM.fail();
      }

      argv.push(gPlusPlus);
      argv.push("-std=" + compilation.cpp);
    } else
    {
      const gcc = await NM.Shell.which("gcc");
      if (!gcc)
      {
        NM.Log.error("gcc not found", "nomake.cToolchain");
        NM.fail();
      }

      argv.push(gcc);
    }

    if (mode == "shared")
    {
      argv.push("-fPIC");
      argv.push("-shared");
    }

    argv.push("-O" + compilation.optimizationLevel);

    for (const includeDir of compilation.includeDirs)
    {
      argv.push("-I" + includeDir);
    }

    for (const source of compilation.sources)
    {
      argv.push(source);
    }

    for (const cflag of compilation.cflags)
    {
      argv.push(cflag);
    }

    for (const libraryDir of compilation.libraryDirs)
    {
      argv.push("-L" + libraryDir);
    }

    for (const linkLib of compilation.linkLibs)
    {
      if (linkLib.kind === "path")
      {
        argv.push("-l:" + linkLib.path);
      } else
      {
        argv.push("-l" + linkLib.name);
      }
    }

    argv.push("-o");
    dest = computeDest(dest, NM.Platform.currentOS, mode);
    argv.push(dest);

    await new NM.Path(dest).parent.mkdir({
      parents: true,
      onError: "existOk",
    });

    await NM.Shell.runChecked(argv, {
      printCmd: true,
      logError: true,
    });
  }
}

// originalDir and originalFile are normalized to be posix path
export type AggregatedPath =
  | { path: string; kind: "file"; tag: number }
  | {
    path: string;
    kind: "dir";
    content: Map<string, AggregatedPath> | "copy";
    tag: number;
  };

function aggFile(path: string, tag?: number): AggregatedPath
{
  return { path, kind: "file", tag: tag ?? 0 };
}

function aggDir(
  path: string,
  content: Map<string, AggregatedPath> | "copy",
  tag?: number,
): AggregatedPath
{
  return { path, kind: "dir", content, tag: tag ?? 0 };
}

function aggregatePath(absPaths: AggregatedPath[]): AggregatedPath[]
{
  const group = new Map<string, Map<string, AggregatedPath>>();
  for (const p of absPaths)
  {
    const original = p;
    const originalPath = new NM.Path(original.path);
    const directory = originalPath.parent.asOsPath();

    const groupI = group.get(directory);
    if (groupI === undefined)
    {
      const m = new Map<string, AggregatedPath>();
      m.set(originalPath.name, original);
      group.set(directory, m);
    } else
    {
      const tags = (groupI.get(originalPath.name)?.tag) ?? 0;
      original.tag = (original.tag ?? 0) | tags;

      groupI.set(originalPath.name, original);
    }
  }

  const terminated: AggregatedPath[] = [];
  const continueGroup: AggregatedPath[] = [];
  for (const [k, v] of group.entries())
  {
    if (v.size == 1)
    {
      const [[fileName, origin]] = Array.from(v.entries());
      if (origin.kind == "file")
      {
        const single = new Map();
        single.set(fileName, origin);
        terminated.push(
          {
            kind: "dir",
            content: single,
            path: k,
            tag: 0,
          },
        );
      } else
      {
        terminated.push(origin);
      }
    } else
    {
      continueGroup.push({
        path: new NM.Path(k).asPosix(),
        kind: "dir",
        content: v,
        tag: 0,
      });
    }
  }
  if (continueGroup.length == 0)
  {
    return terminated;
  } else
  {
    const res = aggregatePath(continueGroup);
    res.push(...terminated);
    return res;
  }
}

export class Zig extends CCompiler
{
  compileSharedLib(compilation: Compilation, dest: string): Promise<void>
  {
    return this.nativeCompile(compilation, dest, "shared");
  }

  compileExe(compilation: Compilation, dest: string): Promise<void>
  {
    return this.nativeCompile(compilation, dest, "exe");
  }
  ccoptions?: CCOptions;
  zigToolchain: ZigToolchain;

  constructor(options?: CCOptions)
  {
    super();
    this.ccoptions = options;
    this.zigToolchain = new ZigToolchain(options);
  }

  async nativeCompile(
    compilation: Compilation,
    dest: string,
    mode: "shared" | "exe",
  )
  {
    const argv: string[] = [];
    const zigExe = await NM.Shell.which("zig");
    if (!zigExe)
    {
      NM.Log.error("zig not found", "nomake.cToolchain");
      NM.fail();
    }
    argv.push(zigExe);
    if (compilation.cpp)
    {
      argv.push("c++");
      argv.push("-std=" + compilation.cpp);
    } else
    {
      argv.push("cc");
    }

    if (mode == "shared")
    {
      argv.push("-fPIC");
      argv.push("-shared");
    }

    argv.push("-target");
    argv.push(this.zigToolchain.target);

    argv.push("-O" + compilation.optimizationLevel);

    for (const includeDir of compilation.includeDirs)
    {
      argv.push("-I" + includeDir);
    }

    for (const source of compilation.sources)
    {
      argv.push(source);
    }

    for (const cflag of compilation.cflags)
    {
      argv.push(cflag);
    }

    for (const libraryDir of compilation.libraryDirs)
    {
      argv.push("-L" + libraryDir);
    }

    for (const linkLib of compilation.linkLibs)
    {
      if (linkLib.kind === "path")
      {
        argv.push("-l:" + linkLib.path);
      } else
      {
        if (this.zigToolchain.os == "windows")
        {
          argv.push("-l" + linkLib.name);
        }
        argv.push("-l" + linkLib.name);
      }
    }

    argv.push("-o");
    dest = computeDest(dest, this.zigToolchain.os, mode);
    argv.push(dest);

    await new NM.Path(dest).parent.mkdir({
      parents: true,
      onError: "existOk",
    });

    await NM.Shell.runChecked(argv, {
      printCmd: true,
      logError: true,
    });

    if (this.zigToolchain.os == "windows")
    {
      // on windows,
      // zig creates <U>.lib where <U> is the name of the first source
      const firstSourceFile = compilation.sources[0];
      if (firstSourceFile === undefined)
      {
        NM.Log.warn(
          "No source file found in the compilation",
          "nomake.cToolchain",
        );
        return;
      }

      const destPath = new NM.Path(dest);
      const source = destPath.parent.join(
        new NM.Path(firstSourceFile).withExt(".lib").name,
      );
      try
      {
        if (!source.isFile())
        {
          NM.Log.warn(
            "No .lib file found in the compilation",
            "nomake.cToolchain",
          );
          return;
        }
        await source.copyTo(destPath.withExt(".lib"));
      } catch
      {
        NM.Log.warn(`Copying ${source.name} failed`, "nomake.cToolchain");
      }
    }
  }
}

function computeDest(dest: string, os: NM.OS, mode: "shared" | "exe")
{
  if (mode == "exe")
  {
    if (os == "windows")
    {
      if (!dest.toLowerCase().endsWith(".exe"))
      {
        dest += ".exe";
      }
    }
  } else if (mode == "shared")
  {
    if (os == "windows")
    {
      if (!dest.toLowerCase().endsWith(".dll"))
      {
        dest += ".dll";
      }
    } else if (os == "linux")
    {
      if (!dest.toLowerCase().endsWith(".so"))
      {
        dest += ".so";
      }
    } else if (os == "macos")
    {
      if (!dest.toLowerCase().endsWith(".dylib"))
      {
        dest += ".dylib";
      }
    } else
    {
      assertNever(os, "os");
    }
  }

  return dest;
}
