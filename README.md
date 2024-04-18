# NoMake: A Statically Checked Building System

A distributed, multi-language building system that supports static checking and autocompletion.

## Installation

1. [Deno](https://deno.com/)
2. Initialize Deno in the root directory of your project (`deno init`) and create `build.ts`. Enter the following code:

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

0. Avoid the forced introduction of specialized knowledge in building: Hence, avoiding the use of Makefile.
1. Reduce the technical difficulty and learning curve of building and publishing multi-language monorepos: Hence, avoiding the use of Makefile.
2. Use static checking to cover the build system: Hence, avoiding the use of Makefile.
3. Support distributed building: Hence, avoiding the use of Makefile, and Deno has advantages.
4. Support splitting build scripts across various parts of the project without affecting static checking: Hence, avoiding Bazel or Python.
5. Avoid excessive transparency on environment variables: Hence, avoiding the use of Makefile.
6. Support importing custom rule sets from code hosting platform URLs: Hence, avoiding NodeJS/Bun.

How to support distributed building:
1. The build server does not install any additional tools. Use Deno to package the build logic into an executable file for the target operating system/architecture. Running this file can build any target on the server.
2. Install Deno on the build server, pull the code, and then call `deno run` to build any target.

## NoMake Features

1. Requires only basic knowledge of TS programming to get started.
2. Unopinionated but powerful: Does not introduce preset building concepts but provides implementations of some common building concepts.
3. The NoMake rule set itself is a Deno library that can be directly imported via URL.
4. Users can publish other building rule sets on GitHub or similar platforms to facilitate importing by other users.

## NoMake Functions

- [x] Platform-related operations such as operating system, architecture, etc. `NM.Platform`
- [x] Environment variable operations `NM.Env`
- [x] File/path operations `NM.Path` (similar to Python `pathlib`)
- [ ] Repository operations `nomake.Repo`
- [x] Logging operations `nomake.Log`
- [ ] C/C++ toolchain operations `nomake.CC`
- [ ] .NET toolchain operations `nomake.NET`
- [ ] Julia toolchain operations `nomake.Julia`
- [ ] Out-of-the-box distributed building capabilities