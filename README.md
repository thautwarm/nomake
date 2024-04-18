[![Chinese Doc](https://img.shields.io/badge/中文文档-latest-orange.svg)](./README.zh_CN.md)

# NoMake: Static, Multi-lingual and Distributed Build System

NoMake is a build system that supports multiple programming languages, static type checking, intellisense and distributed building.

## Prerequisites

1. Install [Deno](https://deno.com/)
2. Initialize Deno in the project root directory using `deno init` and create a file named `build.ts` with the following content:

```typescript
// Future versions will use branch tags to specify versions
import * as NM from 'https://raw.githubusercontent.com/thautwarm/nomakefile/main/mod.ts'
export { NM }

NM.target(
    {
        name: 'build',
        async build()
        {
            NM.Log.ok('Build Complete')
        }
    }
)

NM.makefile()
```

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
- [ ] `nomake.Repo`: Repository operations
- [x] (partial) `nomake.Log`: Logging operations
- [x] (partial) `nomake.CC`: C/C++ toolchain operations
- [ ] `nomake.NET`: .NET toolchain operations
- [ ] `nomake.Julia`: Julia toolchain operations
- [ ] Out-of-the-box distributed building capabilities