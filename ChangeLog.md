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
