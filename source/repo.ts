import { BuildDependencies, TargetParams, target } from "./build.ts";
import { Log } from './log.ts';
import { Shell } from './shell.ts';
import { Path } from './pathlib.ts';

export interface GitRepoOptions
{
    kind: 'https' | 'ssh'
    host: 'github' | 'gitlab' | 'bitbucket' | CustomGitHost
    port?: number
    httpsAuth?: { user: string, passwd: string }
}

export interface CustomGitHost
{
    resolveUrl(repo: string, options?: GitRepoOptions): string
}

function defaultScheme(kind?: 'https' | 'ssh')
{
    // insight: in case of build system, git dependencies always use https
    return kind ?? 'https';
}

const isGitChecked: { val?: boolean } = {}

async function checkGit()
{
    if (isGitChecked.val === undefined)
    {
        try
        {
            await Shell.runChecked(
                ['git', '--version'],
                {
                    printCmd: false,
                    logError: true,
                    stdout: 'ignore',
                    stderr: 'ignore'
                })
            isGitChecked.val = true
        }
        catch
        {
            isGitChecked.val = false
        }
    }
    return isGitChecked.val
}

export abstract class Repo
{
    static url(repo: string, options?: GitRepoOptions)
    {
        while (repo.endsWith("/"))
        {
            Log.warn(`Repo name ends with '/': ${repo}, removing it.`, 'GitRepo')
            repo = repo.slice(0, -1);
        }

        const host = options?.host ?? 'github';

        if (typeof host !== 'string')
        {
            return host.resolveUrl(repo, options);
        }

        switch (host)
        {
            case 'github':
                return GitHubGitHost.inst.resolveUrl(repo, options);
            case 'gitlab':
                return GitHubGitHost.inst.resolveUrl(repo, options);
            case 'bitbucket':
                return GitHubGitHost.inst.resolveUrl(repo, options);
            default:
                throw new Error(`Unknown git host: ${host}`)
        }
    }

    static async clone(repo: string, target?: string, options?: GitRepoOptions)
    {

        if (!await checkGit())
        {
            throw new Error('Git is not installed')
        }

        const url = Repo.url(repo, options)
        const commands = ['git', 'clone', url]
        if (target)
            commands.push(target)

        await Shell.runChecked(commands, { printCmd: true })
    }
}


export class GitlabGitHost implements CustomGitHost
{
    static _inst?: GitlabGitHost;
    static get inst()
    {
        if (!this._inst)
            this._inst = new GitlabGitHost();
        return this._inst;
    }

    resolveUrl(repo: string, options?: GitRepoOptions | undefined): string
    {
        const kind = defaultScheme(options?.kind)

        if (kind === 'ssh')
        {
            return `git@gitlab.com:${repo}.git`
        }
        if (kind === 'https')
        {
            const auth = options?.httpsAuth
            if (auth)
            {
                return `https://${auth.user}:${auth.passwd}@git@gitlab.com/${repo}.git`
            }
            else
            {
                return `https://gitlab.com/${repo}.git`
            }
        }
        throw new Error(`Unknown git kind: ${kind}`)
    }
}

export class GitHubGitHost implements CustomGitHost
{
    static _inst?: GitHubGitHost;

    static get inst()
    {
        if (!this._inst)
            this._inst = new GitHubGitHost();
        return this._inst;
    }

    resolveUrl(repo: string, options?: GitRepoOptions | undefined): string
    {
        const kind = defaultScheme(options?.kind)

        if (kind === 'ssh')
        {
            return `git@github.com:${repo}.git`
        }
        if (kind === 'https')
        {
            const auth = options?.httpsAuth
            if (auth)
            {
                return `https://${auth.user}:${auth.passwd}@git@github.com/${repo}.git`
            }
            else
            {
                return `https://github.com/${repo}.git`
            }
        }
        throw new Error(`Unknown git kind: ${kind}`)
    }
}

export class BitbucketGitHost implements CustomGitHost
{
    static _inst?: BitbucketGitHost;
    static get inst()
    {
        if (!this._inst)
            this._inst = new BitbucketGitHost();
        return this._inst;
    }

    resolveUrl(repo: string, options?: GitRepoOptions | undefined): string
    {
        const kind = defaultScheme(options?.kind)

        if (kind === 'ssh')
        {
            return `git@bitbucket.org.com:${repo}.git`
        }
        if (kind === 'https')
        {
            const auth = options?.httpsAuth
            if (auth)
            {
                return `https://${auth.user}:${auth.passwd}@bitbucket.org/${repo}.git`
            }
            else
            {
                throw new Error(`Bitbucket requires authentication for https clone`)
            }
        }
        throw new Error(`Unknown git kind: ${kind}`)
    }
}

export type RepoTargetParams<It extends BuildDependencies> = Omit<Omit<TargetParams<It>, 'name'>, 'build'> & {
    repo: string,
    gitOptions?: GitRepoOptions,
    storageDir?: string
}

export function repoTarget<It extends BuildDependencies>(params: RepoTargetParams<It>)
{
    let { repo, gitOptions, storageDir, ...rest } = params
    storageDir ??= 'tmp/gitdeps';
    rest.rebuild ??= 'never';

    if (storageDir.endsWith('/'))
    {
        storageDir = storageDir.slice(0, -1)
    }

    return target(
        {
            name: `${storageDir}/${repo}`,
            ...rest,
            async build({ target })
            {
                await new Path(target).parent.mkdir(
                    {
                        parents: true,
                        onError: 'ignore'
                    })
                await Repo.clone(repo, target, gitOptions)
            }
        }
    )
}