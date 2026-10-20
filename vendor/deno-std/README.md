# Vendored glob and directory walking

Source: https://deno.land/std@0.224.0/

`expand_glob.ts`, `walk.ts`, `_create_walk_entry.ts`, `_to_path_string.ts`,
are derived from that release.
Original copyright notices are retained. `LICENSE` contains the upstream MIT
license. `LICENSE-Go` covers the Go-derived walk documentation/interface.
`LICENSE-std-current` contains the license for the newer JSR path dependencies.

Changes from upstream:

- `_runtime.ts` uses shared `source/filesystem.ts` promise operations and wrapped
  synchronous operations. Both runtimes use node:fs to retain structured errno
  codes, including the distinction between EACCES and EPERM.
- `source/errors.ts` converts filesystem failures to NoMake errors. Specific
  classes extend their Deno.errors counterparts on Deno; existing NoMake errors
  pass through the walker unchanged. Stack traces are not copied from cause.
- Runtime cwd/platform checks use `node:process`; missing-path detection uses
  the filesystem error code `ENOENT`.
- All path operations, including glob regex conversion and detection, use pinned
  `jsr:@std/path@1.1.6` imports. Assertions use `node:assert/strict`.
- New path parsing semantics are accepted: for example, `[[]test].ts` is treated
  as a literal path and `@(foo).ts` is recognized as an extended glob.
- Both runtime entrypoints import this implementation directly. There is no
  Node-only glob substitution and no fast-glob dependency.

The original traversal algorithm is retained; matching follows @std/path@1.1.6.
`tests/glob-parity.test.ts` compares unchanged parsing cases with the pinned
original under Deno; `tests/compat.test.ts` checks shared contracts on Deno and the Node
release bundle. Native Windows/Linux coverage is still outstanding.
