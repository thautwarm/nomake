# NoMake: Type-safe, Multi-lingual and Distributed Build System

NoMake defines build tasks and dependencies in TypeScript, with typed dependency
arguments and incremental builds. Build scripts run on Node.js 24.6+ or Deno.

[Documentation](https://thautwarm.github.io/Site-33/3-software/nomake/) ·
[Releases](https://github.com/thautwarm/nomake/releases) ·
[ChangeLog](./ChangeLog.md)

## Quick Start

For Node.js, install NoMake and set `"type": "module"` in your `package.json`:

```sh
npm install @nomake/core@0.2.0
```

Create `input.txt` and a `build.ts`:

```typescript
import * as NM from "@nomake/core";

NM.target({
  name: "output.txt",
  deps: { input: "input.txt" },
  async build({ deps, target }) {
    const text = await new NM.Path(deps.input).readText();
    await new NM.Path(target).writeText(`Hello, ${text}`);
  },
});

NM.target({
  name: "build",
  virtual: true,
  rebuild: "always",
  deps: ["output.txt"],
});

await NM.makefile();
```

Run `node build.ts build`. Subsequent runs reuse `output.txt` until its inputs
or output metadata change. `node build.ts help` lists virtual targets and options.

For Deno, replace the import with:

```typescript
import * as NM from "https://raw.githubusercontent.com/thautwarm/nomake/v0.2.0/mod.ts";
```

Then run `deno run -A build.ts build`. The standalone launcher from
[Releases](https://github.com/thautwarm/nomake/releases) also runs Deno build
scripts with `nomake build`.

## Examples

- [Shared Deno/Node build script](./example/dual-runtime/build.ts)
- [C/C++ with Zig or GCC](./example/ctoolchain/build.ts)
- [C# native compilation with Bflat](./example/bflatproj)
- [Git repository archive](./example/repo/build.ts)
- [HTTP archive](./example/http_archive/build.ts)
- [Building NoMake itself](./startup/build.ts)

## License

MIT. See [LICENSE](./LICENSE).
