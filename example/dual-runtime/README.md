# Deno source / Node bundle example

From the repository root:

```sh
deno task example hello

npm ci
npm run build
node example/dual-runtime/build.ts hello
```

Both commands run the same user build script, generate
`build/dual-runtime/greeting.txt`, then print it. Its `nomake` import resolves to
the TypeScript source on Deno and the package's bundled JS on Node.

Run either command twice to see incremental reuse. Edit `input.txt` to trigger
regeneration. `npm run test:package` verifies the installed-package workflow in a
separate project.
