// deno-lint-ignore-file no-explicit-any
import { Glob } from "../deps.ts";
import { fs, getCwd, os, path as _path } from "./compat.ts";
import { Log } from "./log.ts";

function _toPosixPath(path: string): string
{
  return path.replace(/\\/g, "/");
}

function joinPath(...parts: string[]): string
{
  if (parts[0] == "")
  {
    return _path.join("/", ...parts.slice(1));
  }
  return _path.join(...parts);
}

export type BufferEncoding =
  | "ascii"
  | "utf8"
  | "utf-8"
  | "utf16le"
  | "ucs2"
  | "ucs-2"
  | "base64"
  | "base64url"
  | "latin1"
  | "binary"
  | "hex";

export class Path
{
  parts: string[];
  constructor(p: string | Path)
  {
    if (p instanceof Path)
    {
      this.parts = [...p.parts];
      return;
    }

    this.parts = _toPosixPath(p).split("/");
    if (this.parts.length == 0)
    {
      throw new Error("Path must not be empty");
    }

    if (this.parts.length == 1)
    {
      this.parts = [".", this.parts[0]];
    }
  }

  static cwd(): Path
  {
    return new Path(getCwd());
  }

  static home(): Path
  {
    return new Path(os.homedir());
  }

  map<A>(f: (path: Path) => A): A
  {
    return f(this);
  }

  do(f: (path: Path) => any): Path
  {
    f(this);
    return this;
  }

  asPosix(): string
  {
    return this.parts.join("/");
  }

  asOsPath(): string
  {
    return joinPath(...this.parts);
  }

  join(...parts: string[]): Path
  {
    return new Path(joinPath(...this.parts, ...parts));
  }

  abs()
  {
    if (this.isAbs)
    {
      return this;
    }
    return Path.cwd().join(...this.parts);
  }

  get isAbs(): boolean
  {
    return _path.isAbsolute(this.asOsPath());
  }

  get isRelative(): boolean
  {
    return !this.isAbs;
  }

  get parent(): Path
  {
    return new Path(joinPath(...this.parts.slice(0, -1)));
  }

  get name(): string
  {
    return this.parts[this.parts.length - 1];
  }

  get ext(): string
  {
    return _path.extname(this.name);
  }

  get stem(): string
  {
    const lastPart = this.parts[this.parts.length - 1];
    return _path.basename(lastPart, _path.extname(lastPart));
  }

  withExt(ext?: string)
  {
    const stem = this.stem;
    if (ext) return this.parent.join(stem + ext);
    return this.parent.join(stem);
  }

  async rm(args: {
    /**
     * 删除时的错误处理方式
     *
     * Error handling when deleting
     */
    onError: "ignore" | ((error: any) => any);
    /**
     * 最大重试次数
     *
     * Maximum number of retries
     * @default 0
     * @description
     * 当 recursive 为 true 时，删除目录时可能会失败，因为目录中的文件可能正在被其他进程使用。
     *
     * When recursive is true, deleting a directory may fail because files in the directory may be in use by other processes.
     */
    maxRetries?: number;

    /**
     * 等待重试的时间（以毫秒为单位）
     *
     * Time to wait before retrying in milliseconds
     * @default 100
     */
    retryDelay?: number;
    /**
     * 是否递归删除
     *
     * Whether to delete recursively
     * @default false
     */
    recursive?: boolean;
  })
  {
    const action = () =>
      fs.promises.rm(this.asOsPath(), {
        // (Deno specific): shall be boolean
        recursive: args.recursive ?? false,
        force: true,
        maxRetries: args.maxRetries ?? 0,
        retryDelay: args.retryDelay ?? 100,
      });

    const onError = args.onError;
    if (onError === "ignore")
    {
      try
      {
        await action();
      } catch
      {
        /* ignore */
      }
    } else if (typeof onError == "function")
    {
      try
      {
        await action();
      } catch (e)
      {
        await onError(e);
      }
    } else
    {
      throw new Error(`Invalid onError argument: ${onError}`);
    }
  }

  async exists(): Promise<boolean>
  {
    try
    {
      await fs.promises.access(this.asOsPath());
      return true;
    } catch
    {
      return false;
    }
  }

  async isDir(): Promise<boolean>
  {
    try
    {
      const stat = await fs.promises.stat(this.asOsPath());
      return stat.isDirectory();
    } catch
    {
      return false;
    }
  }

  async isFile(): Promise<boolean>
  {
    try
    {
      const stat = await fs.promises.stat(this.asOsPath());
      return stat.isFile();
    } catch
    {
      return false;
    }
  }

  stat(): Promise<fs.Stats>
  {
    return fs.promises.stat(this.asOsPath());
  }

  readText(encoding?: BufferEncoding): Promise<string>
  {
    const encodingReal = encoding ?? "utf-8";
    return fs.promises.readFile(this.asOsPath(), encodingReal);
  }

  readBytes(): Promise<Uint8Array>
  {
    return Deno.readFile(this.asOsPath());
  }

  async writeText(data: string, options?: BufferEncoding | Deno.WriteFileOptions & { encoding?: BufferEncoding }): Promise<void>
  {
    if (typeof options === 'string')
    {
      options = { encoding: options }
    }

    const encoding = options?.encoding ?? "utf-8";
    const newOpts = Object.assign({}, options)
    delete newOpts.encoding;
    if (encoding !== 'utf-8') Log.warn(`Encoding ${encoding} other than utf-8 is not supported.`)
    await Deno.writeFile(this.asOsPath(), new TextEncoder().encode(data), newOpts);
  }

  async writeBytes(data: Uint8Array, options?: Deno.WriteFileOptions): Promise<void>
  {
    await Deno.writeFile(this.asOsPath(), data, options);
  }

  async mkdir(
    args?: {
      parents?: boolean;
      onError: "existOk" | "ignore" | ((error: any) => any);
      mode?: number;
    },
  )
  {
    const action = () =>
      fs.promises.mkdir(
        this.asOsPath(),
        {
          mode: args?.mode ?? 0o777,
          recursive: args?.parents,
        },
      );
    const onError = args?.onError;
    if (onError === "existOk")
    {
      if (await this.exists())
      {
        return;
      }
      await action();
    } else if (onError === "ignore")
    {
      try
      {
        await action();
      } catch
      {
        /* ignore */
      }
    } else if (typeof onError == "function")
    {
      try
      {
        await action();
      } catch (e)
      {
        await onError(e);
      }
    } else
    {
      throw new Error(`Invalid onError argument: ${onError}`);
    }
  }

  async copyTo(target: string | Path, options?: {
    /**
     * 如果设置了 'contentsOnly'，并且 'target' 和 'destination' 都是目录，
     * 则源目录内的内容将被复制到目标目录。
     *
     * If 'contentsOnly' is set, and both 'target' and 'destination' are directories,
     * the contents inside the source directory (not the source directory itself)
     * will be copied to the target directory.
     */
    contentsOnly?: boolean;
  })
  {
    if (typeof target === "string")
    {
      target = new Path(target);
    }

    if (!await this.exists())
    {
      throw new Error(`Path does not exist: ${this.asOsPath()}`);
    }

    if (await this.isFile())
    {
      if (await target.isFile())
      {
        await fs.promises.copyFile(this.asOsPath(), target.asOsPath());
      } else if (!await target.exists())
      {
        await target.parent.mkdir({ onError: "existOk", parents: true });
        await fs.promises.copyFile(this.asOsPath(), target.asOsPath());
      } else
      {
        await fs.promises.copyFile(
          this.asOsPath(),
          target.join(this.name).asOsPath(),
        );
      }
    } else
    {
      if (await target.isFile())
      {
        throw new Error(`Cannot copy directory to file: ${target.asOsPath()}`);
      }

      if (!await target.exists()) {
        await target.mkdir({ onError: "ignore", parents: true });
      }

      if (options?.contentsOnly)
      {
        await Path.copyContentDir(this, target);
      } else
      {
        await Path.copyDirToDir(this, target);
      }
    }
  }

  private static async copyDirToDir(src: Path, dest: Path)
  {
    const realDest = dest.join(src.name);
    await realDest.mkdir({ onError: "ignore", parents: true });
    await this.copyContentDir(src, realDest);
  }

  private static async copyContentDir(src: Path, dest: Path)
  {
    await dest.mkdir({ onError: "ignore", parents: true });
    const files = await fs.promises.readdir(src.asOsPath());
    const tasks = files.map(async (file) =>
    {
      const srcFile = src.join(file);
      const destFile = dest.join(file);

      const thisIsFile = await srcFile.isFile();
      if (thisIsFile)
      {
        await fs.promises.copyFile(srcFile.asOsPath(), destFile.asOsPath());
      } else
      {
        await Path.copyContentDir(srcFile, destFile);
      }
    });
    await Promise.all(tasks);
  }

  fwalk(
    predicate: (arg: Path) => boolean | Promise<boolean>,
    options?: { includeDir?: boolean; recursive?: boolean },
  ): AsyncGenerator<Path, void, void>;

  fwalk(
    predicate: string,
    options?: { includeDir?: boolean; recursive?: boolean },
  ): AsyncGenerator<Path, void, void>;

  async *fwalk(
    predicate: string | ((arg: Path) => boolean | Promise<boolean>),
    options?: { includeDir?: boolean; recursive?: boolean },
  ): AsyncGenerator<Path, void, void>
  {
    if (typeof predicate === "string")
    {
      const pattern = predicate;
      const re = new RegExp(pattern);
      predicate = (path) => re.test(path.asPosix());
    }
    if (await this.isDir())
    {
      yield* this.unsafeGlobDirectory(predicate, options);
    } else
    {
      if (await predicate(this))
      {
        yield this;
      }
    }
  }

  private async *unsafeGlobDirectory(
    predicate: (arg: Path) => boolean | Promise<boolean>,
    options?: { includeDir?: boolean; recursive?: boolean },
  ): AsyncGenerator<Path, void, void>
  {
    if (options?.includeDir && await predicate(this))
    {
      yield this;
    }

    const files = await fs.promises.readdir(this.asOsPath());
    for (const file of files)
    {
      const item = this.join(file);
      if (await predicate(item))
      {
        yield item;
      }

      if (options?.recursive && await item.isDir())
      {
        yield* item.unsafeGlobDirectory(predicate, options);
      }
    }
  }

  async chmod(mode: number): Promise<void>
  {
    await Deno.chmod(this.asOsPath(), mode);
  }

  relativeTo(target: Path | string): string
  {
    if (typeof target === "string")
    {
      target = new Path(target);
    }

    return _path.relative(target.asOsPath(), this.asOsPath());
  }

  async *iterDir()
  {
    for await (const item of Deno.readDir(this.asOsPath()))
    {
      yield new Path(this.join(item.name));
    }
  }

  async *entries()
  {
    for await (const item of Deno.readDir(this.asOsPath()))
    {
      yield {
        name: item.name,
        isDir: item.isDirectory,
        isFile: item.isFile,
      };
    }
  }

  async* glob(pattern: string, options?:
    {
      absolute?: boolean,
      exclude?: string[],
      includeDirs?: boolean,
      followSymlinks?: boolean
    })
  {
    const root = this.asOsPath();
    const globOptions = {
      root,
      exclude: options?.exclude,
      includeDirs: options?.includeDirs ?? true,
      followSymlinks: options?.followSymlinks ?? false,
    };
    if (options?.absolute)
    {
      for await (const each of Glob.expandGlob(pattern, globOptions))
      {
        yield each.path;
      }
    }
    else
    {
      for await (const each of Glob.expandGlob(pattern, globOptions))
      {
        const p = each.path;
        yield _path.relative(root, p).replaceAll("\\", "/");
      }
    }
  }

  static async* glob(pattern: string, options?:
    {
      root?: string,
      absolute?: boolean,
      exclude?: string[],
      includeDirs?: boolean,
      followSymlinks?: boolean
    })
  {
    const root = options?.root ?? getCwd();
    yield* new Path(root).glob(pattern, options);
  }
}
