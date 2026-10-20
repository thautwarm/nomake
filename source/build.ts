import process from "node:process";
import { randomUUID } from "node:crypto";
import { equalU8Array, never as assertNever } from "./utils.ts";
import { Path } from "./pathlib.ts";
import { Log } from "./log.ts";
import
{
  getNoMakeTaskParallelLimit,
  fs,
  path,
  decodeBase32,
  decodeBase64,
  encodeBase32,
  encodeBase64,
  getEnv,
  Md5Hasher,
} from "./compat.ts";

export class Encode
{
  // base64
  static encodeB64(str: string | Uint8Array | ArrayBuffer): string
  {
    return encodeBase64(str);
  }

  static decodeB64(str: string): Uint8Array
  {
    return decodeBase64(str);
  }

  static encodeB64Path(str: string | Uint8Array | ArrayBuffer): string
  {
    return encodeBase64(str).replaceAll("/", "_");
  }

  static decodeB64Path(str: string): Uint8Array
  {
    return decodeBase64(str.replaceAll("_", "/"));
  }

  // base32
  static encodeB32(str: string | Uint8Array | ArrayBuffer): string
  {
    return encodeBase32(str);
  }

  static decodeB32(str: string): Uint8Array
  {
    return decodeBase32(str);
  }

  static decodeUtf8(bytes: Uint8Array): string
  {
    return new TextDecoder("utf-8").decode(bytes);
  }

  static encodeUtf8(str: string): Uint8Array
  {
    return new TextEncoder().encode(str);
  }
}

const _CACHE_TEXT_TO_B64 = new Map<string, string>();
function cacheTextToB32(s: string)
{
  let v = _CACHE_TEXT_TO_B64.get(s);
  if (v === undefined)
  {
    v = Encode.encodeB32(s); // .replaceAll('/', '_')
    _CACHE_TEXT_TO_B64.set(s, v);
  }
  return v;
}

export type BuildDependency = string | Target;
export type BuildDependencySugar =
  // deno-lint-ignore no-explicit-any
  | AsyncGenerator<BuildDependency, any, any>
  | BuildDependency[]
  | BuildDependency;
export type BuildDependencies = BuildDependencySugar | {
  [key: string]: BuildDependencySugar;
};

async function _collectDeps(
  deps: BuildDependencies,
): Promise<
  {
    deps: string[];
    struct: string | string[] | Record<string, string | string[]>;
  }
>
{
  if (Array.isArray(deps))
  {
    const items = deps.map((dep) => typeof dep == "string" ? dep : dep.name);
    return {
      deps: items,
      struct: items,
    };
  }
  if (typeof deps == "string")
  {
    return {
      deps: [deps],
      struct: deps,
    };
  }

  if (deps instanceof Target)
  {
    return { deps: [deps.name], struct: deps.name };
  }

  if (Symbol.asyncIterator in deps)
  {
    const r: string[] = [];
    for await (const dep of deps)
    {
      if (typeof dep == "string")
      {
        r.push(dep);
      } else
      {
        r.push(dep.name);
      }
    }
    return {
      deps: r,
      struct: r,
    };
  }
  const r: string[] = [];
  const struct: Record<string, string[] | string> = {};
  for (const key in deps)
  {
    const dep = deps[key];
    if (typeof dep == "string")
    {
      struct[key] = dep;
      r.push(dep);
    } else if (dep instanceof Target)
    {
      r.push(dep.name);
      struct[key] = dep.name;
    } else if (Symbol.asyncIterator in dep)
    {
      const seq: string[] = [];
      for await (const d of dep)
      {
        const item = (typeof d == "string") ? d : d.name;
        r.push(item);
        seq.push(item);
      }
      struct[key] = seq;
    } else if (Array.isArray(dep))
    {
      const seq: string[] = [];
      for (const d of dep)
      {
        const item = (typeof d == "string") ? d : d.name;
        r.push(item);
        seq.push(item);
      }
      struct[key] = seq;
    } else
    {
      assertNever(dep);
    }
  }
  return {
    deps: r,
    struct,
  };
}

type InferTarget<It extends BuildDependencySugar> = It extends BuildDependency[]
  ? string[]
  : It extends BuildDependency ? string
  : It extends AsyncIterable<BuildDependency> ? string[]
  // deno-lint-ignore no-explicit-any
  : any;

type InferRecord<It extends { [key: string]: BuildDependencySugar }> = {
  [key in keyof It]: InferTarget<It[key]>;
};
type InferTargets<It extends BuildDependencies> =
  /**
   * if `It = BuildDependency[]` -> string[]
   * if `It = BuildDependency` -> string
   * if `It = AsyncIterable<BuildDependency>` -> string[]
   * if `It = { [key: string]: T }` -> { [key: string]: InferTargets<T> }
   */
  It extends BuildDependency[] ? string[]
  : It extends BuildDependency ? string
  : It extends AsyncIterable<BuildDependency> ? string[]
  : It extends infer D extends { [key: string]: BuildDependencySugar }
  ? InferRecord<D>
  : never;

export type ResolvedTargets =
  | string
  | string[]
  | Record<string, string | string[]>;

export class Target
{
  name: string;
  build?: (
    arg: { deps: ResolvedTargets; target: string },
  ) => void | Promise<void>;
  rebuild: "always" | "never" | "onChanged";
  private deps:
    | BuildDependencies
    | (() => Promise<BuildDependencies> | BuildDependencies);
  virtual: boolean;
  doc?: string;
  logError?: boolean;

  _evaluatedDeps: {
    deps: string[];
    struct: string | string[] | Record<string, string | string[]>;
  } | undefined;

  private initialDependencies?: Promise<{ deps: string[]; struct: ResolvedTargets }>;
  private dependencyJobs = new WeakMap<object, Promise<{ deps: string[]; struct: ResolvedTargets }>>();

  // Factories are replayable per runner; concrete iterators retain their snapshot.
  async evalDeps(scope?: object)
  {
    if (scope && typeof this.deps === "function")
    {
      let job = this.dependencyJobs.get(scope);
      if (!job)
      {
        const factory = this.deps;
        job = Promise.resolve().then(async () => _collectDeps(await factory.call(this)));
        this.dependencyJobs.set(scope, job);
      }
      return await job;
    }
    if (this._evaluatedDeps)
    {
      return this._evaluatedDeps;
    }
    this.initialDependencies ??= Promise.resolve().then(async () => {
      const value = typeof this.deps === "function" ? await this.deps() : this.deps;
      return await _collectDeps(value);
    });
    const pending = this.initialDependencies;
    try { this._evaluatedDeps = await pending; }
    catch (error)
    {
      // Legacy unscoped factories may retry; consumed concrete iterators cannot.
      if (typeof this.deps === "function" && this.initialDependencies === pending)
        this.initialDependencies = undefined;
      throw error;
    }
    return this._evaluatedDeps;
  }

  constructor(
    name: string,
    build: undefined | ((
      arg: { deps: BuildDependencies; target: string },
    ) => void | Promise<void>),
    rebuild: "always" | "never" | "onChanged",
    deps:
      | BuildDependencies
      | (() => Promise<BuildDependencies> | BuildDependencies),
    virtual: boolean,
    doc?: string,
    logError?: boolean,
  )
  {
    this.name = name;
    this.build = build;
    this.rebuild = rebuild;
    this.deps = deps;
    this.virtual = virtual;
    this.doc = doc;
    this.logError = logError;
  }
}

export type TargetParams<It extends BuildDependencies> = {
  /**
   * 构建目标的唯一标识符
   *
   * A unique identifier for the target.
   *
   * 用于调用、区分和缓存目标。
   *
   * Responsible for invoking, distinguishing and caching the target.
   */
  name: string;
  /**
   * 构建目标的依赖项。
   *
   * Dependencies of the target.
   *
   * 如果目标是实体文件 (artifacts)，则应该是文件路径 (string)。
   *
   * If the target is an artifact, it should be a file path (string).
   */
  deps?: It | (() => It | Promise<It>);

  /**
   * 目标是否虚拟的（即没有实体文件，类比 Makefile 中的 PHONY）。
   *
   * If the target is virtual (i.e. no artifact, analogous to PHONY in Makefile).
   */
  virtual?: boolean;

  /**
   * 构建目标的文档。
   *
   * The documentation of the target.
   */
  doc?: string;

  /**
   * 构建目标的逻辑。
   *
   * The build logic of the target.
   */
  build?: (
    arg: { deps: InferTargets<It>; target: string },
  ) => void | Promise<void>;
  /**
   * 构建目标的重构建模式。
   *
   * - 'always': 总是重构建目标。
   *
   * - 'never': 从不重构建目标。
   *
   * - 'onChanged': 如果任何依赖项已更改，则重构建目标。
   *
   * The rebuild mode of the target.
   *
   * - 'always': always rebuild the target.
   *
   * - 'never': never rebuild the target.
   *
   * - 'onChanged': rebuild the target if any of its dependencies has been changed.
   *
   * !!! PS1: 当未指定依赖项时，目标将始终重构建。
   *
   * !!! PS1: when the dependencies are not specified, the target will always be rebuilt.
   *
   * !!! PS2: 'onChanged' 不会跟踪目录内容的更改
   *
   * !!! PS2: 'onChanged' will not track the changes of directory contents
   */
  rebuild?: "always" | "never" | "onChanged";

  /**
   * 当构建目标失败，是否记录错误（默认为 true）。
   *
   * Whether to log errors when building the target fails (default to true).
   */
  logError?: boolean;
};

export function target<It extends BuildDependencies>(
  args: TargetParams<It>,
): Target
{
  const rebuild = args.rebuild ?? (args.deps ? "onChanged" : "always");
  const it = new Target(
    args.name,
    args.build as (
      arg: { deps: BuildDependencies; target: string },
    ) => void | Promise<void>,
    rebuild,
    (args.deps ?? []) as BuildDependencies,
    args.virtual ?? false,
    args.doc,
  );
  _COMMANDS.set(args.name, it);
  return it;
}

export class MakefileRunner
{
  private jobs = new Map<string, Promise<void>>();
  /** Successful jobs in this session. Mutating this set does not restart jobs. */
  builtTargets: Set<string | Target>;
  buildingTargets: Set<string>;
  _cacheHome: Path | undefined;
  _cacheTargetDir: Path | undefined;
  cwd: Path;

  constructor()
  {
    this.builtTargets = new Set();
    this._cacheHome = undefined;
    this.cwd = Path.cwd();
    this.buildingTargets = new Set();
  }

  initPath()
  {
    if (!this._cacheHome || !this._cacheTargetDir)
    {
      const cacehDirStr = process.env["NOMAKE_CACHE_DIR"] ?? ".nomake_files";
      this._cacheHome = new Path(cacehDirStr).abs();
      this._cacheTargetDir = this._cacheHome.join("targets");
    }

    return { home: this._cacheHome, targets: this._cacheTargetDir };
  }

  get cacheHome()
  {
    return this.initPath().home;
  }

  get cacheTargetDir()
  {
    return this.initPath().targets;
  }

  async _assureCacheDir()
  {
    // Strict initialization: retain filesystem type, errno and original cause.
    await fs.promises.mkdir(this.cacheHome.asOsPath(), { recursive: true });
    await fs.promises.mkdir(this.cacheTargetDir.asOsPath(), { recursive: true });
  }

  private async getCacheHash(targetSelf: string)
  {
    const cacheFile = this.cacheTargetDir.join(cacheTextToB32(targetSelf));
    try
    {
      if (!(await cacheFile.stat()).isFile()) return new Uint8Array();
      const text = await cacheFile.readText();
      try
      {
        const hash = Encode.decodeB64(text);
        return hash.length === 16 ? hash : new Uint8Array();
      } catch { return new Uint8Array(); }
    } catch (error)
    {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return new Uint8Array();
    }
  }

  private async revokeCacheHash(targetSelf: string)
  {
    try { await fs.promises.unlink(this.cacheTargetDir.join(cacheTextToB32(targetSelf)).asOsPath()); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }

  private async saveCacheHash(targetSelf: string, hash: Uint8Array)
  {
    const destination = this.cacheTargetDir.join(cacheTextToB32(targetSelf)).asOsPath();
    const temporary = path.join(this.cacheTargetDir.asOsPath(), `.${randomUUID()}.tmp`);
    // Own the temporary file before entering cleanup; never remove someone else's file.
    const file = await fs.promises.open(temporary, "wx");
    let committed = false;
    try
    {
      try { await file.writeFile(Encode.encodeB64(hash)); }
      finally { await file.close(); }
      await fs.promises.rename(temporary, destination);
      committed = true;
    } finally
    {
      if (!committed)
      {
        try { await fs.promises.unlink(temporary); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
    }
  }

  private async targetExists(targetName: string)
  {
    try { await new Path(path.resolve(this.cwd.asOsPath(), targetName)).stat(); return true; }
    catch (error)
    {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return false;
    }
  }

  private async computeHash(
    preReqs: string[],
    targetSelf: string,
    isPhony: boolean,
  )
  {
    preReqs = Array.from(preReqs).sort();
    const hgen = new Md5Hasher();
    hgen.update("nomake-metadata-v2\0");
    if (!isPhony)
    {
      hgen.update("fs@");
      hgen.update(targetSelf);
      const p = new Path(path.resolve(this.cwd.asOsPath(), targetSelf));
      try
      {
        const stat = await p.stat();
        hgen.update("exist@");
        hgen.update(`${stat.mtimeMs}:${stat.size}:${stat.mode & fs.constants.S_IFMT}`);
      } catch (error)
      {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        hgen.update("unknown@");
      }
    } else
    {
      hgen.update("phony@");
      hgen.update(targetSelf);
    }

    for (const preReq of preReqs)
    {
      hgen.update("+");
      hgen.update(preReq);
      const eachHash = await this.getCacheHash(preReq);
      hgen.update(eachHash);
    }

    return hgen.digest();
  }

  run(targetName: string): Promise<void>
  {
    const existing = this.jobs.get(targetName);
    if (existing) return existing;
    const pending = Promise.resolve().then(async () => {
      this.buildingTargets.add(targetName);
      try
      {
        await this.runOnce(targetName);
        this.builtTargets.add(targetName);
      } finally { this.buildingTargets.delete(targetName); }
    });
    this.jobs.set(targetName, pending);
    return pending;
  }

  private async runOnce(targetName: string)
  {
    await this._assureCacheDir();
    const proft = new Proft(targetName);

    let target: Target | undefined;
    try
    {
      target = _COMMANDS.get(targetName);
      let deps: string[] = [];
      let depStruct: ResolvedTargets = [];
      if (target)
      {
        const depsInfo = await target.evalDeps(this);
        deps = depsInfo.deps;
        depStruct = depsInfo.struct;
        if (NO_PARALLEL)
        {
          for (const dep of deps)
          {
            await this.run(dep);
          }
        } else
        {
          const limit = getNoMakeTaskParallelLimit();
          for (let start = 0; start < deps.length; start += limit)
          {
            // Drain the active batch before propagating failure to a new session.
            const results = await Promise.allSettled(deps.slice(start, start + limit).map((dep) => this.run(dep)));
            const failure = results.find((result) => result.status === "rejected");
            if (failure?.status === "rejected") throw failure.reason;
          }
        }
      }

      const isPhony = target?.virtual ?? false;

      let newHash = await this.computeHash(
        deps,
        targetName,
        isPhony ?? false,
      );

      const oldHash = await this.getCacheHash(targetName);

      if (!target && !isPhony)
      {
        // resource
        if (equalU8Array(newHash, oldHash))
        {
          return;
        }

        await this.saveCacheHash(targetName, newHash);
        return;
      }

      if (target)
      {
        if (target.rebuild === "always")
        {
          /* pass */
        } else if (
          target.rebuild == "onChanged" &&
          equalU8Array(newHash, oldHash) &&
          (isPhony || await this.targetExists(targetName))
        )
        {
          Log.info(`skipping ${targetName}`, `NoMake.Build`);
          return;
        } else if (
          target.rebuild == "never" &&
          !isPhony &&
          await this.targetExists(targetName)
        )
        {
          await this.saveCacheHash(targetName, newHash);
          return;
        }
      } else
      {
        if (equalU8Array(newHash, oldHash))
        {
          return;
        }
      }

      await this.revokeCacheHash(targetName);
      await this.runImpl(targetName, depStruct);

      newHash = await this.computeHash(
        deps,
        targetName,
        isPhony ?? false,
      );

      await this.saveCacheHash(targetName, newHash);
    } catch (e)
    {
      if (target?.logError ?? true)
      {
        Log.error(`Failed to build ${targetName}`, "NoMake.Build");
      }
      throw e;
    } finally
    {
      proft.dispose();
    }
  }

  private async runImpl(
    targetName: string,
    struct: string | string[] | Record<string, string | string[]>,
  )
  {
    const target = _COMMANDS.get(targetName);
    const virtual = target?.virtual ?? false;

    if (target)
    {
      if (!virtual)
      {
        Log.info(`Building ${targetName}`, "NoMake.Build");
      }
      else
      {
        Log.info(`Start`, targetName);
      }
    }

    if (!virtual)
    {
      const p = new Path(path.resolve(this.cwd.asOsPath(), targetName));
      if (target && await this.targetExists(targetName))
      {
        // Actually, this is only needed when the target
        // is a directory.
        // However, it is not easy to determine (the target could change drastically)
        // Hence, we always remove the target.
        if ((target.rebuild == "always" || target.rebuild == "onChanged"))
        {
          await p.rm({
            onError: "ignore",
            maxRetries: 0,
            recursive: true,
          });
        } else if (target.rebuild == "never")
        {
          return;
        }
      }
    } else
    {
      if (!target)
      {
        Log.error(
          `No virtual target found for ${targetName}`,
          `NoMake.Build`,
        );
        fail();
      }
    }

    // this is a redundant test
    // to comfort the type checker
    if (target)
    {
      const build = target.build;
      if (build)
      {
        await build({ deps: struct, target: targetName });
      }

      if (virtual)
      {
        Log.ok(`Done`, targetName);
      }
    }
  }

}

export class NonFatal extends Error { }

const NO_PARALLEL = Boolean(getEnv("NOMAKE_NO_PARALLEL"));
const NOMAKE_PROF = Boolean(getEnv("NOMAKE_PROF"));
const _COMMANDS: Map<string, Target> = new Map();
type OptionDef = {
  callback: (arg: { key: string; value: string }) => void;
  doc?: string;
};

const _OPTIONS = new Map<string, OptionDef>();

/**
 * 使用场景：
 * 1. 表示某项构建任务失败
 * 2. 发生非致命但需要中断的情况（其他任务可根据试错结果进行响应）
 *
 * Use case:
 * 1. Indicate that a build task fails
 * 2. Non-fatal but need to interrupt the process (other tasks can respond according to the trial results)
 */
export function fail(msg?: string): never
{
  if (msg)
  {
    Log.error(msg);
  }
  throw new NonFatal();
}

/**
 * 执行 trial()，如果捕获到 fail() 引发的异常，执行 onFailure() 并返回其结果。
 *
 * Execute trial(), if an exception caused by fail() is caught, execute onFailure() and return its result.
 */
export function allowFail<A>(trial: () => A, onFailure: () => A): A
{
  try
  {
    return trial();
  } catch (e)
  {
    if (e instanceof NonFatal)
    {
      return onFailure();
    }
    throw e;
  }
}

export async function allowFailAsync<A>(
  trial: () => Promise<A>,
  onFailure: () => A,
): Promise<A>
{
  try
  {
    return await trial();
  } catch (e)
  {
    if (e instanceof NonFatal) return onFailure();
    throw e;
  }
}

export function option(
  key: string,
  options:
    // deno-lint-ignore no-explicit-any
    ((arg: { key: string; value: string }) => any) | {
      // deno-lint-ignore no-explicit-any
      callback: (arg: { key: string; value: string }) => any;
      doc?: string;
    },
)
{
  const { callback, doc } = (typeof options == "function")
    ? { callback: options, doc: undefined }
    : options;
  if (_OPTIONS.has(key))
  {
    throw new Error(`Option ${key} already registered`);
  }
  _OPTIONS.set(key, { callback, doc });
}

export function parseOptions(targets?: string[])
{
  targets ??= process.argv.slice(2);
  function parseConf(conf: string)
  {
    const iD = conf.indexOf("-D");
    const iEq = conf.indexOf("=");
    if (iEq == -1)
    {
      const k = conf.slice(iD + 2);
      return [k, "ON"];
    }
    const k = conf.slice(iD + 2, iEq);
    const v = conf.slice(iEq + 1);
    return [k, v];
  }

  for (const target of targets)
  {
    if (target.startsWith("-D"))
    {
      const [k, v] = parseConf(target);
      const optionDef = _OPTIONS.get(k);
      if (!optionDef)
      {
        Log.warn(`Option ${k} not registered`, "NoMake.Options");
        continue;
      }
      optionDef.callback({ key: k, value: v });
    }
  }
}

export async function makefile(targets?: string[])
{
  targets ??= process.argv.slice(2);
  function printHelp()
  {
    console.log("Targets:");
    for (const [name, target] of _COMMANDS)
    {
      if (target.virtual)
      {
        console.log(`    [${name}] ${target.doc ?? "Undocumented"}`);
      }
    }

    if (_OPTIONS.size > 0)
    {
      console.log("Options:");
      for (const [key, option] of _OPTIONS)
      {
        console.log(`    [-D${key}=value] ${option.doc ?? "Undocumented"}`);
      }
    }
    return;
  }

  if (!targets)
  {
    printHelp();
    return;
  }

  let runner: MakefileRunner | undefined;
  for (const target of targets)
  {
    if (target == "help")
    {
      printHelp();
      return;
    }
    // options
    if (target.startsWith("-D")) continue;
    runner ??= new MakefileRunner();
    await runner.run(target);
  }
}

class Proft
{
  time: number;
  title: string;
  constructor(title: string)
  {
    this.time = Date.now();
    this.title = title;
  }
  dispose()
  {
    if (NOMAKE_PROF)
    {
      const ms = Date.now() - this.time;
      console.log(`[${this.title}]: ${ms / 1000}s`);
    }
  }
}
