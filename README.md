[![Chinese Doc](https://img.shields.io/badge/中文文档-latest-orange.svg)](./README.zh_CN.md)

# NoMake: Static, Multi-lingual and Distributed Build System

NoMake is a build system that supports multiple programming languages, static type checking, intellisense and distributed building.

## Get Started

1. Install [Deno](https://deno.com/)
2. Initialize Deno in the project root directory using `deno init` and create a file named `build.ts` with the following content:

```typescript
// See nomake/example/welcome for the details
// Future versions will use branch tags to specify versions
import * as NM from 'https://github.com/thautwarm/nomake/raw/main/mod.ts'
export { NM }

const cBuild = NM.target({
    name: 'dist/windows-x64/hello.exe',
    deps: ['hello.c'], // or () => ['hello.c'] for lazy deps
    async build({ target })
    {
        const C = new NM.CC.Compilation()
        C.sources.push("hello.c")

        await assureDir(target)
        // cross compilation to windows no matter what the host platform is
        await C.compileExe(target, new NM.CC.Zig({ os: 'windows' }))
    }
})

const csBuild = NM.target(
    {
        name: 'dist/linux-x64/libhello.so',
        deps: ['hello.cs'],
        async build({ target })
        {
            const build = new NM.Bflat.Build();
            build.mode = 'shared';
            build.os = 'linux';
            await assureDir(target)
            await build.run(target)
        }
    }
)

NM.target(
    {
        name: 'build',
        deps: [cBuild, csBuild],
        build: () => NM.Log.ok('Build Complete')
    }
)

const assureDir = (target: string) =>
    new NM.Path(target)
          .parent.mkdir({ parents: true, onError: 'existOk' })

NM.makefile()
```

3. Run `deno run -A build.ts build` to build the project.

## Motivation

0. No mandatory introduction of the specialized knowledge in build system (Avoid: Makefile)
1. Reduce the technical difficulty and learning curve of building and publishing multi-lingual monorepos (Avoid: Makefile)
2. Prefer a build system covered by static checking and intellisense (Avoid: Makefile, Bazel)
3. Distributed building and security concerns (Avoid: Makefile; Prefer: Deno)
4. Separate build scripts across the project without affecting static checking and intellisense (Avoid: Bazel, Python)
5.  Avoid pursuing excessive reference transparency for environment variables (Avoid: Makefile)
6.  Import custom rule sets via direct urls of code hosting platforms (Avoid: NodeJS/Bun)

How to support distributed building:
1. If the build server does not install any additional tools: The build logic can packaged as an executable file for the target operating system/architecture using Deno. Running the executable on the server can build any target.

2. If the build server installs Deno: Pull the code, call `deno run build.ts` to build any target.

## NoMake Features

1. Only basic skills of TypeScript programming is needed.
2. Unopinionated but powerful: fewer pre-set building concepts, but rich integration of tools for common building concepts.
3. NoMake itself is a Deno library containing basic rule sets for building and can be directly imported via URL.
4. Users can publish their own rule sets on GitHub or similar platforms to facilitate importing by other users.

## NoMake Functions

- [x] `NM.Platform`: Platform-related operations (operating system, architecture, etc)
- [x] `NM.Env`: modern operations on environment variables
- [x] `NM.Path`: modern File/path operations  (similar to Python `pathlib`)
- [ ] `NM.Repo`: Repository operations
- [x] (partial) `NM.Log`: Logging operations
- [x] (partial) `NM.CC`: C/C++ toolchain operations
- [x] `NM.Bflat`: Bflat toolchain integration to support C# AOT projects
- [ ] `NM.Julia`: Julia toolchain operations
- [ ] Out-of-the-box distributed building capabilities