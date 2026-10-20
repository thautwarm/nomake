// Runtime operations used by the vendored Deno std algorithms.
import * as fs from "../../source/filesystem.ts";
import { fileSystemCall } from "../../source/errors.ts";
const fsp = fs.promises;
import { cwd, platform } from "node:process";

export { cwd };
export const isWindows = platform === "win32";

export interface DirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}

function info(value: fs.Stats) {
  return {
    isFile: value.isFile(),
    isDirectory: value.isDirectory(),
    isSymlink: value.isSymbolicLink(),
  };
}
function entry(value: fs.Dirent): DirEntry {
  return {
    name: value.name,
    isFile: value.isFile(),
    isDirectory: value.isDirectory(),
    isSymlink: value.isSymbolicLink(),
  };
}
export async function stat(path: string) { return info(await fsp.stat(path)); }
export function statSync(path: string) { return info(fileSystemCall(() => fs.statSync(path))); }
export async function lstat(path: string) { return info(await fsp.lstat(path)); }
export function lstatSync(path: string) { return info(fileSystemCall(() => fs.lstatSync(path))); }
export async function* readDir(path: string): AsyncGenerator<DirEntry> {
  for (const value of await fsp.readdir(path, { withFileTypes: true })) yield entry(value);
}
export function readDirSync(path: string): DirEntry[] {
  return fileSystemCall(() => fs.readdirSync(path, { withFileTypes: true })).map(entry);
}
export const realPath = (path: string) => fsp.realpath(path);
export const realPathSync = (path: string) => fileSystemCall(() => fs.realpathSync(path));
export function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}
