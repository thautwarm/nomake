import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import process from "node:process";
import
{
  decodeBase32,
  decodeBase64,
  encodeBase32,
  encodeBase64,
  fs,
  os,
  path,
} from "../deps.ts";
export { decodeBase32, decodeBase64, encodeBase32, encodeBase64, fs, os, path };

export class Md5Hasher
{
  private md5 = createHash("md5");
  update(data: string | Uint8Array)
  {
    this.md5.update(data);
  }

  digest()
  {
    return new Uint8Array(this.md5.digest());
  }
}

export function getCwd()
{
  return process.cwd();
}

export function setEnv(name: string, val?: string)
{
  if (val !== undefined)
  {
    process.env[name] = val;
  } else
  {
    delete process.env[name];
  }
}

export function getEnv(name: string)
{
  return process.env[name];
}

export function removeUndefFields(o: { [key: string]: string | undefined })
{
  let noUndef = true;
  for (const key of Object.keys(o))
  {
    if (o[key] === undefined)
    {
      noUndef = false;
      break;
    }
  }
  if (noUndef) return o as { [key: string]: string };

  const newEnv: { [key: string]: string } = {};
  for (const key of Object.keys(o))
  {
    if (o[key] !== undefined)
    {
      newEnv[key] = o[key] as string;
    }
  }
  return newEnv;
}

type CommandStreamMode = "piped" | "inherit" | "null";

// Describe only the native API used here, keeping Node declarations independent
// of Deno's ambient types.
interface DenoCommandRuntime
{
  Command?: new (command: string, options: {
    args: string[];
    cwd?: string;
    env?: Record<string, string>;
    stdout?: CommandStreamMode;
    stderr?: CommandStreamMode;
  }) => {
    output(): Promise<{ code: number; stdout: Uint8Array; stderr: Uint8Array }>;
  };
}

export async function spawnCmd(
  argv: string[],
  options?: {
    cwd?: string;
    env?: { [key: string]: string | undefined };
    stderr?: CommandStreamMode;
    stdout?: CommandStreamMode;
  },
)
{
  if (argv.length == 0)
  {
    throw new Error(`Empty commands`);
  }

  const proc = await whichCommand(argv[0]);
  if (!proc)
  {
    throw new Error(`Command not found: ${argv[0]}`);
  }

  const deno = (globalThis as { Deno?: DenoCommandRuntime }).Deno;
  if (typeof deno?.Command === "function")
  {
    // Native environment inheritance needs no permission to enumerate env vars.
    const out = await new deno.Command(proc, {
      args: argv.slice(1),
      cwd: options?.cwd,
      env: options?.env === undefined ? undefined : removeUndefFields(options.env),
      stdout: options?.stdout,
      stderr: options?.stderr,
    }).output();
    return {
      stdout: options?.stdout === "piped" ? (tryAutoDecode(out.stdout) ?? "<unknown stdout>") : "",
      stderr: options?.stderr === "piped" ? (tryAutoDecode(out.stderr) ?? "<unknown stderr>") : "",
      success: out.code === 0,
      errorcode: out.code,
    };
  }

  const streamMode = (mode?: CommandStreamMode) =>
    mode === "inherit" ? "inherit" : mode === "null" ? "ignore" : "pipe";
  const child = spawn(proc, argv.slice(1), {
    cwd: options?.cwd,
    env: options?.env === undefined ? undefined : { ...process.env, ...removeUndefFields(options.env) },
    stdio: ["ignore", streamMode(options?.stdout), streamMode(options?.stderr)],
  });
  const stdout: Uint8Array[] = [];
  const stderr: Uint8Array[] = [];
  child.stdout?.on("data", (chunk: Uint8Array) => stdout.push(chunk));
  child.stderr?.on("data", (chunk: Uint8Array) => stderr.push(chunk));
  const code = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      // Match Deno's 128 + signal-number convention on Unix.
      resolve(code ?? (signal ? 128 + (os.constants.signals[signal] ?? 0) : 1));
    });
  });
  return {
    stdout: options?.stdout === "piped" ? (tryAutoDecode(Buffer.concat(stdout)) ?? "<unknown stdout>") : "",
    stderr: options?.stderr === "piped" ? (tryAutoDecode(Buffer.concat(stderr)) ?? "<unknown stderr>") : "",
    success: code === 0,
    errorcode: code,
  };
}

export function tryAutoDecode(bytes: Uint8Array)
{
  for (const encoding of ["utf-8", "GBK", "GB2312", "GB18030", "Big5"])
  {
    try
    {
      return new TextDecoder(encoding).decode(bytes);
    } catch
    {
      /* ignore */
    }
  }
  return undefined;
}

export function pathsep()
{
  if (process.platform == "win32")
  {
    return ";";
  }
  return ":";
}

const _isWindows: { value?: boolean } = { value: undefined };
const _isExeMode = fs.constants.S_IXUSR | fs.constants.S_IXGRP |
  fs.constants.S_IXOTH;

export async function isExe(path: string)
{
  if (_isWindows.value === undefined)
  {
    _isWindows.value = process.platform == "win32";
  }

  if (_isWindows.value)
  {
    try
    {
      // windows has no concept of executable bit
      // we only check for file existence
      const stats = await fs.promises.lstat(path);
      return stats.isFile();
    } catch
    {
      return false;
    }
  } else
  {
    try
    {
      const stat = await fs.promises.stat(path);
      return stat.isFile() && !!(stat.mode & _isExeMode);
    } catch
    {
      return false;
    }
  }
}

export async function whichCommand(name: string)
{
  const list: string[] = process.env["PATH"]?.split(pathsep()) || [];
  const isWin = process.platform == "win32";
  let findExe: (p: string) => Promise<string | undefined>;
  if (isWin)
  {
    const exts =
      ((process.env["PATHEXT"]?.toLowerCase()) ?? ".exe;.cmd;.bat;.com")
        ?.split(";") || [];

    findExe = async (p: string) =>
    {
      // exact match
      const pLowered = p.toLowerCase();
      for (const ext of exts)
      {
        if (pLowered.endsWith(ext))
        {
          if (await isExe(p)) return p;
          else return undefined;
        }
      }

      for (const ext of exts)
      {
        const pSuffixed = p + ext;
        if (await isExe(pSuffixed)) return pSuffixed;
      }
      return undefined;
    };
  } else
  {
    findExe = async (p: string) =>
    {
      if (await isExe(p)) return p;
      return undefined;
    };
  }

  if (path.isAbsolute(name))
  {
    const found = await findExe(name);
    if (found) return found;
  }

  let p = path.join(".", name);
  p = path.resolve(p);
  const found = await findExe(p);
  if (found) return found;

  for (const dir of list)
  {
    let p = path.join(dir, name);
    p = path.resolve(p);
    const found = await findExe(p);
    if (found) return found;
  }
  return undefined;
}

export async function readFile(p: string): Promise<Uint8Array>
{
  return new Uint8Array(await fs.promises.readFile(p));
}

export async function allPromisesUnderLimitedParallelism<T>(
  opts: {
    tasks: (() => Promise<T>)[],
    limit?: number
  },
): Promise<T[]>
{
  const promises = opts.tasks;
  const limit = opts.limit ?? getNoMakeTaskParallelLimit();
  const res: T[] = [];
  const range = { start: 0, end: limit };

  while (range.start < promises.length)
  {
    const chunk = promises.slice(range.start, range.end);
    const chunkRes = await Promise.all(chunk.map((p) => p()));
    res.push(...chunkRes);

    range.start = range.end;
    range.end = Math.min(range.end + limit, promises.length);
  }

  return res;
}

export const DEFAULT_TASK_PARALLEL_LIMIT = 12;

export function getNoMakeTaskParallelLimit()
{
  const envSetting = process.env["NOMAKE_TASK_PARALLEL_LIMIT"];
  if (envSetting)
  {
    const limit = parseInt(envSetting);
    if (!isNaN(limit) && limit >= 1)
    {
      return limit;
    }
  }
  return DEFAULT_TASK_PARALLEL_LIMIT;
}
