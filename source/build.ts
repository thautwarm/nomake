import { equalU8Array } from './utils.ts';
import { Path } from './pathlib.ts';
import { Log } from './log.ts';
import { encodeBase64, decodeBase64, Md5Hasher, getEnv } from "./compat.ts";
import { on } from "node:process";

export class Encode
{
    static encodeB64(str: string): string
    {
        return encodeBase64(str);
    }

    static decodeB64Bytes(str: string): Uint8Array
    {
        return decodeBase64(str);
    }

    static encodeB64Bytes(bytes: Uint8Array): string
    {
        return encodeBase64(bytes);
    }
}


const _CACHE_TEXT_TO_B64 = new Map<string, string>();
function cacheTextToB64(s: string)
{
    let v = _CACHE_TEXT_TO_B64.get(s)
    if (v === undefined)
    {
        v = Encode.encodeB64(s)
        _CACHE_TEXT_TO_B64.set(s, v)
    }
    return v
}

type Dep = string | Target
export class Target
{
    name: string
    build: (() => void | Promise<void>)
    rebuild: 'always' | 'never' | 'onChanged'
    private deps: Dep[] | (() => (Dep[] | Promise<Dep[]>))
    virtual: boolean
    doc?: string

    _evaluatedDeps: Dep[] | undefined

    // handle the lazy evaluation of dependencies
    async evalDeps()
    {
        if (this._evaluatedDeps)
            return this._evaluatedDeps;
        if (typeof this.deps == 'function')
        {
            this._evaluatedDeps = await this.deps();
        }
        else
        {
            this._evaluatedDeps = this.deps;
        }
        return this._evaluatedDeps;
    }

    constructor(
        name: string,
        build: (() => void | Promise<void>),
        rebuild: 'always' | 'never' | 'onChanged',
        deps: Dep[] | (() => (Dep[] | Promise<Dep[]>)),
        virtual: boolean, doc?: string
    )
    {
        this.name = name;
        this.build = build;
        this.rebuild = rebuild;
        this.deps = deps;
        this.virtual = virtual;
        this.doc = doc;
    }
}

export function target(
    args: {
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
        deps?: Dep[] | (() => (Dep[] | Promise<Dep[]>)),

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
        build: (() => void | Promise<void>),
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
    }
): Target
{
    const rebuild = args.rebuild ?? (args.deps ? 'onChanged' : 'always');
    const it = new Target(args.name, args.build, rebuild, args.deps ?? [], args.virtual ?? false, args.doc)
    Commands.set(args.name, it);
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
        const cacheFile = this.cacheTargetDir.join(cacheTextToB64(targetSelf));
        try
        {
            const stat = await cacheFile.stat();
            if (stat.isFile())
            {
                const encodedCache = await cacheFile.readText();
                return Encode.decodeB64Bytes(encodedCache);
            }
            else if (stat.isDirectory())
            {
                const r = new TextEncoder().encode(stat.mtime.toUTCString());
                for (let i = 0; i < r.length; i++)
                {
                    r[i] = r[i] ^ (i % 256);
                }
                return r;
            }
        }
        catch
        {
            /* do nothing */
        }

        return new Uint8Array();

    }

    private async saveCacheHash(targetSelf: string, hash: Uint8Array)
    {
        const cacheFile = this.cacheTargetDir.join(cacheTextToB64(targetSelf));
        await cacheFile.writeText(Encode.encodeB64Bytes(hash));
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
                hgen.update(cacheTextToB64(targetSelf))
                if (await p.isFile())
                {
                    hgen.update("~file=")
                    const buf = await p.readBytes();
                    if (buf.length > 2)
                    {
                        buf[buf.length / 2] = buf[buf.length / 2] ^ 0xa8;
                    }
                    else if (buf.length == 2)
                    {
                        buf[0] = buf[0] ^ 0xa9;
                        buf[1] = buf[1] ^ 0xa9;
                    }
                    else if (buf.length == 1)
                    {
                        buf[0] = buf[0] ^ 0xa2;
                    }
                    else
                    {
                        hgen.update("~|empty")
                    }
                    hgen.update(buf)
                }
            }
            else
            {
                hgen.update("unknown@")
                hgen.update(cacheTextToB64(targetSelf))
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
            let timeToWarn = 1000;
            while (this.buildingTargets.has(targetName))
            {
                await new Promise((resolve) => setTimeout(resolve, 100));
                if (timeToWarn < 0)
                {
                    Log.warn(`Waiting for ${targetName}`, 'NoMake.Build')
                }
                else
                {
                    timeToWarn -= 100;
                }
            }
            return;
        }

        this.buildingTargets.add(targetName);
        const proft = new Proft(targetName)

        try
        {

            const target = Commands.get(targetName)
            let deps: string[] = []
            if (target)
            {
                deps = (await target.evalDeps()).map((dep) => typeof dep == 'string' ? dep : dep.name);
                const tasks = deps.map(dep => this.run(dep));
                await Promise.all(tasks);
            }

            const isPhony = target?.virtual ?? false
            if (isPhony && !target)
            {
                if (await this.cwd.join(targetName).exists())
                    return;

                Log.error(`No virtual target found for ${targetName}`)
                fail();
            }


            let newHash = await this.computeHash(
                deps,
                targetName,
                isPhony ?? false
            )
            const oldHash = await this.getCacheHash(targetName)

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

            await this.runImpl(targetName);

            newHash = await this.computeHash(
                deps,
                targetName,
                isPhony ?? false
            )

            await this.saveCacheHash(targetName, newHash)
        }
        finally
        {
            proft.dispose();
            this.buildingTargets.delete(targetName);
        }
    }

    private async runImpl(targetName: string)
    {
        try
        {
            const target = Commands.get(targetName)
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

            // this is a redundant test
            // to comfort the type checker
            if (target)
            {
                await target.build()
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

const NOMAKE_PROF = Boolean(getEnv('NOMAKE_PROF'))
const Commands: Map<string, Target> = new Map()
const MakefileInstance = new MakefileRunner()

/**
 * 使用场景：
 * 1. 表示某项构建任务失败
 * 2. 发生非致命但需要中断的情况（其他任务可根据试错结果进行响应）
 *
 * Use case:
 * 1. Indicate that a build task fails
 * 2. Non-fatal but need to interrupt the process (other tasks can respond according to the trial results)
 */
export function fail(): never
{
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


export async function makefile(targets?: string[])
{
    targets ??= Deno.args;
    for (const target of targets)
    {
        if (!target || target == "help")
        {
            for (const [name, target] of Commands)
            {
                console.log(`[${name}] ${target.doc ?? "Undocumented"}`)
            }
            return;
        }
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