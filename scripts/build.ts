import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { generateDtsBundle } from "dts-bundle-generator";

function run(command: string, args: string[])
{
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
  return result.stdout;
}

await mkdir("dist", { recursive: true });
run("deno", ["bundle", "--platform=deno", "--format=esm", "mod.ts", "-o", "dist/index.js"]);

// TypeScript does not resolve HTTP imports. Mirror the exact graph already resolved
// by Deno for declaration generation; this does not change source imports/versions.
const graph = JSON.parse(run("deno", ["info", "--json", "mod.ts"]));
const typeDirectory = path.resolve(".nomake_files/npm-types");
const remoteDirectory = path.join(typeDirectory, "remote");
for (const module of graph.modules as { specifier: string; local?: string }[])
{
  if (!module.specifier.startsWith("https://") || !module.local) continue;
  const url = new URL(module.specifier);
  const destination = path.join(remoteDirectory, url.host, url.pathname);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(module.local, destination);
}
// Resolve JSR specifiers through the same pinned graph as the JS bundle.
const jsrPaths = Object.fromEntries(
  Object.entries(graph.redirects ?? {})
    .filter(([specifier, resolved]) => specifier.startsWith("jsr:") && String(resolved).startsWith("https://"))
    .map(([specifier, resolved]) => {
      const url = new URL(String(resolved));
      return [specifier, [path.join(remoteDirectory, url.host, url.pathname)]];
    }),
);
const configuration = JSON.parse(await readFile("tsconfig.json", "utf8"));
const typeConfig = path.join(typeDirectory, "tsconfig.json");
await writeFile(typeConfig, JSON.stringify({
  compilerOptions: {
    ...configuration.compilerOptions,
    erasableSyntaxOnly: false,
    verbatimModuleSyntax: false,
    paths: {
      ...jsrPaths,
      "https://*": [path.join(remoteDirectory, "*")],
      "npm:shlex": [path.resolve("node_modules/shlex/shlex.d.ts")],
    },
  },
  files: [path.resolve("mod.ts")],
}));
const [types] = generateDtsBundle([{
  filePath: "mod.ts",
  output: { noBanner: true },
}], { preferredConfigPath: typeConfig });
await writeFile("dist/index.d.ts", types);
await copyFile("LICENSE", "dist/LICENSE");
// Preserve all third-party license notices alongside the bundle.
const visited = new Set<string>();
let notices = "Third-party licenses bundled with NoMake\n";
async function includeLicense(dependency: string, from: string)
{
  const require = createRequire(from);
  let folder = path.dirname(require.resolve(dependency));
  while (true)
  {
    try { await readFile(path.join(folder, "package.json")); break; }
    catch (error)
    {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" || path.dirname(folder) === folder) throw error;
      folder = path.dirname(folder);
    }
  }
  if (visited.has(folder)) return;
  visited.add(folder);
  const metadata = JSON.parse(await readFile(path.join(folder, "package.json"), "utf8"));
  let license: string | undefined;
  for (const name of ["LICENSE", "LICENSE.md", "LICENSE.txt", "license"])
  {
    try { license = await readFile(path.join(folder, name), "utf8"); break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  if (!license) throw new Error(`Missing license for ${dependency}`);
  notices += `\n--- ${metadata.name}@${metadata.version} (${metadata.license}) ---\n${license}\n`;
  for (const child of Object.keys(metadata.dependencies ?? {}).sort())
    await includeLicense(child, path.join(folder, "package.json"));
}
for (const dependency of ["shlex"])
  await includeLicense(dependency, path.resolve("package.json"));
for (const version of ["0.224.0"])
  notices += `\n--- deno standard library ${version} (MIT) ---\n${await readFile(`scripts/licenses/deno-std-${version}.txt`, "utf8")}\n`;
notices += `\n--- @std/path@1.1.6 and its @std dependencies (MIT) ---\n${await readFile("vendor/deno-std/LICENSE-std-current", "utf8")}\n`;
notices += `\n--- Go authors (BSD-3-Clause; vendored walk documentation/interface) ---\n${await readFile("vendor/deno-std/LICENSE-Go", "utf8")}\n`;
await writeFile("dist/THIRD_PARTY_LICENSES.txt", notices);
