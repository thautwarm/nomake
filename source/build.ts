import { equalU8Array, never as assertNever } from './utils.ts';
import { Path } from './pathlib.ts';
import { Log } from './log.ts';
import { encodeBase64, decodeBase64, encodeBase32, decodeBase32, Md5Hasher, getEnv } from "./compat.ts";

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
        return encodeBase64(str).replaceAll('/', '_')
    }

    static decodeB64Path(str: string): Uint8Array
    {
        return decodeBase64(str.replaceAll('_', '/'));
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
        return new TextDecoder('utf-8').decode(bytes);
    }

    static encodeUtf8(str: string): Uint8Array
    {
        return new TextEncoder().encode(str);
    }
}

const _CACHE_TEXT_TO_B64 = new Map<string, string>();
function cacheTextToB32(s: string)
{
    let v = _CACHE_TEXT_TO_B64.get(s)
    if (v === undefined)
    {
        v = Encode.encodeB32(s) // .replaceAll('/', '_')
        _CACHE_TEXT_TO_B64.set(s, v)
    }
    return v
}

export type BuildDependency = string | Target
// deno-lint-ignore no-explicit-any
export type BuildDependencySugar = AsyncGenerator<BuildDependency, any, any> | BuildDependency[] | BuildDependency
export type BuildDependencies = BuildDependencySugar | { [key: string]: BuildDependencySugar }

async function _collectDeps(deps: BuildDependencies): Promise<{ deps: string[], struct: string | string[] | Record<string, string | string[]> }>
{
    if (Array.isArray(deps))
    {
        const items = deps.map((dep) => typeof dep == 'string' ? dep : dep.name);
        return {
            deps: items,
            struct: items,
        }
    }
    if (typeof deps == 'string')
        return {
            deps: [deps],
            struct: deps,
        }

    if (deps instanceof Target)
        return { deps: [deps.name], struct: deps.name };

    if (Symbol.asyncIterator in deps)
    {
        const r: string[] = [];
        for await (const dep of deps)
        {
            if (typeof dep == 'string')
                r.push(dep);
            else
                r.push(dep.name);
        }
        return {
            deps: r,
            struct: r,
        }
    }
    const r: string[] = [];
    const struct: Record<string, string[] | string> = {};
    for (const key in deps)
    {
        const dep = deps[key];
        if (typeof dep == 'string')
        {
            struct[key] = dep;
            r.push(dep);
        }
        else if (dep instanceof Target)
        {
            r.push(dep.name);
            struct[key] = dep.name;
        }
        else if (Symbol.asyncIterator in dep)
        {
            const seq: string[] = [];
            for await (const d of dep)
            {
                const item = (typeof d == 'string') ? d : d.name;
                r.push(item);
                seq.push(item);
            }
            struct[key] = seq;
        }
        else if (Array.isArray(dep))
        {
            const seq: string[] = []
            for (const d of dep)
            {
                const item = (typeof d == 'string') ? d : d.name;
                r.push(item);
                seq.push(item)
            }
            struct[key] = seq;
        }
        else
        {
            assertNever(dep);
        }
    }
    return {
        deps: r,
        struct
    }
}

type InferTarget<It extends BuildDependencySugar> =
    It extends BuildDependency[] ? string[] :
    It extends BuildDependency ? string :
    // deno-lint-ignore no-explicit-any
    It extends AsyncIterable<BuildDependency> ? string[] : any

type InferRecord<It extends { [key: string]: BuildDependencySugar }> =
    {
        [key in keyof It]: InferTarget<It[key]>
    }
type InferTargets<It extends BuildDependencies> =
    /**
     * if `It = BuildDependency[]` -> string[]
     * if `It = BuildDependency` -> string
     * if `It = AsyncIterable<BuildDependency>` -> string[]
     * if `It = { [key: string]: T }` -> { [key: string]: InferTargets<T> }
     */
    It extends BuildDependency[] ? string[] :
    It extends BuildDependency ? string :
    It extends AsyncIterable<BuildDependency> ? string[] :
    It extends infer D extends { [key: string]: BuildDependencySugar } ? InferRecord<D> : never

export type ResolvedTargets = string | string[] | Record<string, string | string[]>

export class Target
{
    name: string
    build: (arg: { deps: ResolvedTargets, target: string }) => void | Promise<void>
    rebuild: 'always' | 'never' | 'onChanged'
    private deps: BuildDependencies | (() => Promise<BuildDependencies> | BuildDependencies)
    virtual: boolean
    doc?: string
    logError?: boolean

    _evaluatedDeps: { deps: string[], struct: string | string[] | Record<string, string | string[]> } | undefined

    // handle the lazy evaluation of dependencies
    async evalDeps()
    {
        if (this._evaluatedDeps)
            return this._evaluatedDeps;
        if (typeof this.deps == 'function')
        {
            this._evaluatedDeps = await _collectDeps(await this.deps());
        }
        else
        {
            this._evaluatedDeps = await _collectDeps(this.deps);
        }
        return this._evaluatedDeps;
    }

    constructor(
        name: string,
        build: (arg: { deps: BuildDependencies, target: string }) => void | Promise<void>,
        rebuild: 'always' | 'never' | 'onChanged',
        deps: BuildDependencies | (() => Promise<BuildDependencies> | BuildDependencies),
        virtual: boolean, doc?: string,
        logError?: boolean
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
    name: string,
    /**
     * 构建目标的依赖项。
     *
     * Dependencies of the target.
     *
     * 如果目标是实体文件 (artifacts)，则应该是文件路径 (string)。
     *
     * If the target is an artifact, it should be a file path (string).
     */
    deps?: It | (() => (It | Promise<It>)),

    /**
     * 目标是否虚拟的（即没有实体文件，类比 Makefile 中的 PHONY）。
     *
     * If the target is virtual (i.e. no artifact, analogous to PHONY in Makefile).
     */
    virtual?: boolean,

    /**
     * 构建目标的文档。
     *
     * The documentation of the target.
     */
    doc?: string,

    /**
     * 构建目标的逻辑。
     *
     * The build logic of the target.
     */
    build: (arg: { deps: InferTargets<It>, target: string }) => void | Promise<void>,
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
    rebuild?: 'always' | 'never' | 'onChanged',

    /**
     * 当构建目标失败，是否记录错误（默认为 true）。
     *
     * Whether to log errors when building the target fails (default to true).
     */
    logError?: boolean
}

export function target<It extends BuildDependencies>(args: TargetParams<It>): Target
{
    const rebuild = args.rebuild ?? (args.deps ? 'onChanged' : 'always');
    const it = new Target(
        args.name,
        args.build as (arg: { deps: BuildDependencies, target: string }) => void | Promise<void>,
        rebuild,
        (args.deps ?? []) as BuildDependencies,
        args.virtual ?? false, args.doc
    )
    _COMMANDS.set(args.name, it);
    return it;

}

export class MakefileRunner
{
    builtTargets: Set<string | Target>;
    buildingTargets: Set<string>
    _cacheHome: Path | undefined;
    _cacheTargetDir: Path | undefined;
    cwd: Path;

    constructor()
    {
        this.builtTargets = new Set();
        this._cacheHome = undefined;
        this.cwd = Path.cwd()
        this.buildingTargets = new Set();
    }

    initPath()
    {
        if (!this._cacheHome || !this._cacheTargetDir)
        {
            const cacehDirStr = Deno.env.get('NOMAKE_CACHE_DIR') ?? '.nomake_files';
            this._cacheHome = new Path(cacehDirStr).abs();
            this._cacheTargetDir = this._cacheHome.join('targets');
        }

        return { home: this._cacheHome, targets: this._cacheTargetDir }
    }

    get cacheHome()
    {
        return this.initPath().home
    }

    get cacheTargetDir()
    {
        return this.initPath().targets
    }

    _assureCacheDir()
    {
        this.cacheHome.mkdir({
            onError: 'ignore',
            parents: true
        })

        if (!this.cacheHome.isDir())
            throw new Error(`cache directory is not available: ${this.cacheHome.asOsPath()}`)

        this.cacheTargetDir.mkdir({
            onError: 'ignore',
            parents: true
        })

        if (!this.cacheTargetDir.isDir())
            throw new Error(`target cache directory is not available: ${this.cacheTargetDir.asOsPath()}`)

    }

    private async getCacheHash(targetSelf: string)
    {
        const cacheFile = this.cacheTargetDir.join(cacheTextToB32(targetSelf));
        try
        {
            const stat = await cacheFile.stat();
            if (stat.isFile())
            {
                const encodedCache = await cacheFile.readText();
                return Encode.decodeB64(encodedCache);
            }
            return Encode.encodeUtf8('unknown//' + targetSelf)
        }
        catch
        {
            /* do nothing */
        }

        return new Uint8Array();

    }

    private async saveCacheHash(targetSelf: string, hash: Uint8Array)
    {
        const cacheFile = this.cacheTargetDir.join(cacheTextToB32(targetSelf));
        await cacheFile.writeText(Encode.encodeB64(hash));
    }

    private async computeHash(preReqs: string[], targetSelf: string, isPhony: boolean)
    {
        preReqs = Array.from(preReqs).sort()
        const hgen = new Md5Hasher()
        if (!isPhony)
        {
            hgen.update('fs@')
            hgen.update(targetSelf)
            const p = new Path(targetSelf);
            if (await p.exists())
            {
                hgen.update("exist@")
                hgen.update(cacheTextToB32(targetSelf))
                if (!_COMMANDS.has(targetSelf))
                {
                    try
                    {
                        const stat = await p.stat();
                        hgen.update(`${stat.mtimeMs}:${stat.size}:${stat.isFile}`)
                    }
                    catch
                    {
                        hgen.update("~nonfile=")
                    }
                }
                else
                {
                    hgen.update("~filetarget@")
                }
            }
            else
            {
                hgen.update("unknown@")
                hgen.update(cacheTextToB32(targetSelf))
            }
        }
        else
        {
            hgen.update('phony@')
            hgen.update(targetSelf)
        }

        for (const preReq of preReqs)
        {
            hgen.update("+")
            hgen.update(preReq)
            const eachHash = await this.getCacheHash(preReq)
            hgen.update(eachHash)
        }

        return hgen.digest()
    }

    async run(targetName: string)
    {
        this._assureCacheDir();

        if (this.builtTargets.has(targetName))
            return;

        if (this.buildingTargets.has(targetName))
        {
            // if others are building this target, we just wait
            let timeToWarn = 2000;
            while (this.buildingTargets.has(targetName))
            {
                await new Promise((resolve) => setTimeout(resolve, 64));
                if (timeToWarn < 0)
                {
                    Log.warn(`Waiting for ${targetName}`, 'NoMake.Build')
                    timeToWarn = 2000
                }
                else
                {
                    timeToWarn -= 64;
                }
            }
            return;
        }

        this.buildingTargets.add(targetName);
        const proft = new Proft(targetName)

        let target: Target | undefined;
        try
        {
            target = _COMMANDS.get(targetName)
            let deps: string[] = []
            let depStruct: ResolvedTargets = []
            if (target)
            {
                const depsInfo = await target.evalDeps();
                deps = depsInfo.deps;
                depStruct = depsInfo.struct;
                if (NO_PARALLEL)
                {
                    for (const dep of deps)
                    {
                        await this.run(dep);
                    }
                }
                else
                {
                    const tasks = deps.map(dep => this.run(dep));
                    await Promise.all(tasks);
                }
            }

            const isPhony = target?.virtual ?? false

            let newHash = await this.computeHash(
                deps,
                targetName,
                isPhony ?? false
            )

            const oldHash = await this.getCacheHash(targetName)

            if (!target && !isPhony)
            {
                // resource
                if (equalU8Array(newHash, oldHash))
                    return;

                await this.saveCacheHash(targetName, newHash)
                return
            }

            if (target)
            {
                if (target.rebuild === 'always')
                {
                    /* pass */
                }
                else if (
                    target.rebuild == "onChanged"
                    && equalU8Array(newHash, oldHash)
                    && (isPhony || await this.cwd.join(targetName).exists())
                )
                {
                    Log.info(`skipping ${targetName}`, `NoMake.Build`)
                    return;
                }
                else if (
                    target.rebuild == 'never'
                    && !isPhony
                    && await this.cwd.join(targetName).exists())
                {
                    await this.saveCacheHash(targetName, newHash)
                    return;
                }
            }
            else
            {
                if (equalU8Array(newHash, oldHash))
                {
                    return;
                }
            }

            await this.runImpl(targetName, depStruct);

            newHash = await this.computeHash(
                deps,
                targetName,
                isPhony ?? false
            )

            await this.saveCacheHash(targetName, newHash)
        }
        catch (e)
        {
            if (target?.logError ?? true)
            {
                Log.error(`Failed to build ${targetName}`, 'NoMake.Build')
            }
            throw e;
        }
        finally
        {
            proft.dispose();
            this.buildingTargets.delete(targetName);
        }
    }

    private async runImpl(targetName: string, struct: string | string[] | Record<string, string | string[]>)
    {
        try
        {
            const target = _COMMANDS.get(targetName)
            const virtual = target?.virtual ?? false

            if (target && !virtual)
                Log.info(`Building ${targetName}`, 'NoMake.Build');

            if (!virtual)
            {
                const p = this.cwd.join(targetName)
                if (await p.exists() && target)
                {
                    // Actually, this is only needed when the target
                    // is a directory.
                    // However, it is not easy to determine (the target could change drastically)
                    // Hence, we always remove the target.
                    if ((target.rebuild == 'always' || target.rebuild == 'onChanged'))
                    {
                        await p.rm({
                            onError: 'ignore',
                            maxRetries: 0,
                            recursive: true,
                        });
                    }
                    else if (target.rebuild == 'never')
                    {
                        return;
                    }
                }
            }
            else
            {
                if (!target)
                {
                    Log.error(`No virtual target found for ${targetName}`, `NoMake.Build`)
                    fail();
                }
            }

            // this is a redundant test
            // to comfort the type checker
            if (target)
            {
                await target.build({
                    deps: struct, target: targetName
                })
            }
        }
        finally
        {
            this.builtTargets.add(targetName)
        }
    }
}

export class NonFatal extends Error
{ }

const NO_PARALLEL = Boolean(getEnv('NOMAKE_NO_PARALLEL'))
const NOMAKE_PROF = Boolean(getEnv('NOMAKE_PROF'))
const _COMMANDS: Map<string, Target> = new Map()
const MakefileInstance = new MakefileRunner()
type OptionDef = {
    callback: (arg: { key: string, value: string }) => void
    doc?: string
}

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
        Log.error(msg)
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
    }
    catch (e)
    {
        if (e instanceof NonFatal)
        {
            return onFailure();
        }
        throw e;
    }
}

export async function allowFailAsync<A>(trial: () => Promise<A>, onFailure: () => A): Promise<A>
{
    try
    {
        return await trial();
    }
    catch (e)
    {
        if (e instanceof NonFatal) return onFailure();
        throw e;
    }
}

export function option(
    key: string,
    options:
        // deno-lint-ignore no-explicit-any
        ((arg: { key: string, value: string }) => any) | { callback: (arg: { key: string, value: string }) => any, doc?: string })
{

    const { callback, doc } = (typeof options == 'function') ? { callback: options, doc: undefined } : options
    if (_OPTIONS.has(key))
    {
        throw new Error(`Option ${key} already registered`)
    }
    _OPTIONS.set(key, { callback, doc });
}

export function parseOptions(targets?: string[])
{
    targets ??= Deno.args;
    function parseConf(conf: string)
    {
        const iD = conf.indexOf("-D");
        const iEq = conf.indexOf("=");
        if (iEq == -1)
        {
            const k = conf.slice(iD + 2);
            return [k, 'ON']
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
                Log.warn(`Option ${k} not registered`, 'NoMake.Options')
                continue;
            }
            optionDef.callback({ key: k, value: v });
        }
    }
}

export async function makefile(targets?: string[])
{
    targets ??= Deno.args;
    function printHelp()
    {
        console.log("Targets:")
        for (const [name, target] of _COMMANDS)
        {
            if (target.virtual)
                console.log(`    [${name}] ${target.doc ?? "Undocumented"}`)
        }

        console.log("Options:")
        for (const [key, option] of _OPTIONS)
        {
            console.log(`    [-D${key}=value] ${option.doc ?? "Undocumented"}`)
        }
        return;
    }

    if (!targets)
    {
        printHelp();
        return;
    }

    for (const target of targets)
    {
        if (target == "help")
        {
            printHelp();
            return;
        }
        // options
        if (target.startsWith("-D")) continue;
        await MakefileInstance.run(target)
    }
}

class Proft
{
    time: number
    title: string
    constructor(title: string)
    {
        this.time = Date.now()
        this.title = title
    }
    dispose()
    {
        if (NOMAKE_PROF)
        {
            const ms = Date.now() - this.time;
            console.log(`[${this.title}]: ${ms / 1000}s`)
        }
    }
}