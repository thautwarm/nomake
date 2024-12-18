import
{
  decodeBase32,
  decodeBase64,
  encodeBase32,
  encodeBase64,
  fs,
  Md5,
  os,
  path,
} from "../deps.ts";
export { decodeBase32, decodeBase64, encodeBase32, encodeBase64, fs, os, path };

export class Md5Hasher
{
  private md5: Md5;
  constructor()
  {
    this.md5 = new Md5();
  }

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
  return Deno.cwd();
}

export function setEnv(name: string, val?: string)
{
  if (val)
  {
    Deno.env.set(name, val);
  } else
  {
    Deno.env.delete(name);
  }
}

export function getEnv(name: string)
{
  return Deno.env.get(name);
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

export async function spawnCmd(
  argv: string[],
  options?: {
    cwd?: string;
    env?: { [key: string]: string | undefined };
    stderr?: "piped" | "inherit" | "null";
    stdout?: "piped" | "inherit" | "null";
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

  // (Deno specific): deno env value cannot be undefined
  const env = options?.env === undefined
    ? undefined
    : removeUndefFields(options?.env);

  const command = new Deno.Command(
    proc,
    {
      args: argv.slice(1),
      stderr: options?.stderr,
      stdout: options?.stdout,
      cwd: options?.cwd,
      env: env,
    },
  );

  const out = await command.output();
  const stdout = (options?.stdout !== "piped")
    ? ""
    : (tryAutoDecode(out.stdout) ?? "<unknown stdout>");
  const stderr = (options?.stderr !== "piped")
    ? ""
    : (tryAutoDecode(out.stderr) ?? "<unknown stderr>");
  const res = {
    stdout,
    stderr,
    success: out.code == 0,
    errorcode: out.code,
  };
  return res;
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
  if (Deno.build.os == "windows")
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
    _isWindows.value = Deno.build.os == "windows";
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
  const list: string[] = Deno.env.get("PATH")?.split(pathsep()) || [];
  const isWin = Deno.build.os == "windows";
  let findExe: (p: string) => Promise<string | undefined>;
  if (isWin)
  {
    const exts =
      ((Deno.env.get("PATHEXT")?.toLowerCase()) ?? ".exe;.cmd;.bat;.com")
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

export function readFile(p: string)
{
  return Deno.readFile(p);
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
  const envSetting = Deno.env.get("NOMAKE_TASK_PARALLEL_LIMIT");
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
