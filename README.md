# NoMake: Type-safe, Multi-lingual and Distributed Build System

NoMake is a build system that supports multiple programming languages, static
type checking, intellisense and distributed building.

1. [Documentation](https://thautwarm.github.io/Site-33/3-software/nomake/)
2. Installation: download the latest release from
   [GitHub Releases](https://github.com/thautwarm/nomake/releases)
3. Examples:
   1. [NoMake Starter](https://github.com/thautwarm/nomake/blob/main/startup/build.ts):
      NoMake Release built by NoMake itself
   2. [CToolchain](https://github.com/thautwarm/nomake/blob/main/example/ctoolchain/build.ts):
      C/C++ example using Zig/GCC
   3. [C# Native AOT](https://github.com/thautwarm/nomake/tree/main/example/bflatproj):
      C# cross-platform native compilation using Bflat (no .NET SDK and Visual
      Studio)
   4. [Git Repository Archive](https://github.com/thautwarm/nomake/blob/main/example/repo/build.ts):
      Target-based Git repo clone
   5. [HTTP Archive](https://github.com/thautwarm/nomake/blob/main/example/http_archive/build.ts):
      Target-based HTTP archive

## Quick Start

[Download](https://github.com/thautwarm/nomake/releases) and unzip binaries into
your PATH.

For Unix-like systems, you might use `chmod +x nomake deno` to make them
executable.

Then your create a `build.ts` file in your project root:

```typescript
/* filename: build.ts */

import * as NM from "https://github.com/thautwarm/nomake/raw/v0.1.11/mod.ts";

// define options
NM.option("legacy", ({ value }) => {/* do stuff with value */});

// parse options
NM.parseOptions();

// define one or more targets
NM.target(
  {
    name: "output.txt",
    deps: { file: "input.txt" },
    async build({ deps, target })
    {
      const input = await new NM.Path(deps.file).readText();
      await new NM.Path(target).writeText(
        "Hello, " + input,
      );
    },
  },
);

NM.target(
  {
    name: "build",
    deps: ["output.txt"],
    // the top-level virtual target should be always rebuilt
    rebuild: "always",
  },
);

// trigger the build process
await NM.makefile();
```

If you create a `input.txt` file in the same directory, you can run
`nomake output.txt` in the terminal to build `output.txt`.

Running `nomake build`, the file `output.txt` will be rebuilt only if you change
`input.txt` again.

You could invoke the command `nomake help` to show available targets and
options.

## License

NoMake is licensed under the MIT License. See [LICENSE](./LICENSE) for more
information.
