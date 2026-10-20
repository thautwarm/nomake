v0.2.0
---------
- Add Node.js 24.6+ support and the `@nomake/core` ESM npm package with bundled dependencies and TypeScript declarations. Deno continues to run the TypeScript source.
- Filesystem operations now throw NoMake errors such as `NotFound` (`ENOENT`), `AlreadyExists` (`EEXIST`), `NotADirectory` (`ENOTDIR`) and `PermissionDenied` (retaining the actual `EACCES` or `EPERM`). All match `instanceof NM.FileSystemError`; on Deno, specific classes also match their corresponding `Deno.errors` classes. Unknown filesystem errors use `FileSystemError` and retain their original code.
- Filesystem errors retain the original error in `cause` and keep their own stack; the original stack is available through `cause.stack`. Cancelled filesystem requests are wrapped too, with the cancellation reason in `cause`. Build actions, dependency factories and error callbacks retain their own exceptions.
- Fix `onChanged` builds so changes to generated files invalidate their consumers. File type, modification time, size and dependencies are checked; content changes that preserve both modification time and size remain undetected.
- A shared target executes once per build session. All consumers receive its final result, dependency failures prevent downstream actions, and failed builds wait for already-started sibling tasks to finish.
- A failed rebuild no longer allows the next `onChanged` build to reuse partial output. Cache initialization, metadata and cache I/O failures now stop the build instead of being treated as a cache miss or a success.
- Start a new build session for each `makefile()` call. A `MakefileRunner` instance represents one session; failed targets require a new runner to retry. Its public target sets report progress and no longer control execution.
- Reevaluate dependency factories per session, preserving their `this` binding. Concrete async generators share their first complete dependency snapshot, including concurrent requests.
- Deno and Node use the same glob behavior, with newer pattern parsing: `@(name)` is recognized as an extended glob, while `[[]name]` is treated as a literal path.
- Honor `Path.writeText()` encodings instead of always writing UTF-8.
- Allow empty environment values without deleting the variables.

v0.1.12
---------
- adding `NM.p` to ease the building of path objects.
- adding `NM.version` to allow downstream projects to check the validity/compatibility.

v0.1.11
---------
- the build system now works allow configuring the number of parallel jobs to use (default is `12`; configurable via `NOMAKE_TASK_PARALLEL_LIMIT` environment variable).
- get rid of an upstream bug in `deno` that causes `deno` to throw an error when checking executable permissions on Windows (ref: denoland/deno#27405).

v0.1.10
---------
- `build` parameter is now optional to `NM.target`
- `nomake help` now does not show `Options:` if there are no options.
- adding `Path.extensions()` method to return all extensions of a file path.
- adding the following path string converters for their extreme frequent use in any project.
    - `NM.fixExePath(string, OS)`: `NM.fixExePath('a', 'windows')` -> `a.exe`
    - `NM.fixDllPath(string, OS)`:
      `NM.fixDllPath('libaa.so.8', 'linux')` -> `libaa.so.8`,
      `NM.fixDllPath('libaa.8', 'linux')` -> `libaa.8.so`.
    - `NM.fixHostDllPath(string)`: `NM.fixHostDllPath(a) == NM.fixDllPath(a, NM.Platform.currentOS)`
    - `NM.fixHostExePath(string)`
- adding `NM.urlToValidFileName()` for converting a URL to a short & valid file name.
- `NM.webArchive` now uses `urlToValidFileName` to generate unique names for downloadeded files.

v0.1.6
--------

- Implement `Path.glob` (both static and non-static) (e7305392) based on [https://deno.land/std@0.223.0/fs/expand_glob.ts](https://deno.land/std@0.223.0/fs/expand_glob.ts).
- Support `branch` parameter for `repoTarget` and `Repo` class methods.

v0.1.5
--------

- Implement `NM.Log.addTransport` and `NM.Log.rmTransport` (5df66eb5).
