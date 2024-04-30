import * as NM from '../../mod.ts';


export async function assureBflat()
{
    const bflat = await NM.Shell.which("bflat");
    if (!bflat)
    {
        NM.Log.error("bflat not found!");
        const message = [
            "Please install bflat. The following ways are recommanded:",
            "* https://github.com/bflattened/bflat/releases"
        ]
        NM.Log.error(message.join("\n"));
        NM.fail();
    }

    return bflat;
}

export type LangVersion =
    | 6
    | 7
    | 8
    | 'latest'
    | 'preview'
    | 'default'
    | 'latestmajor'

export interface BflatBuildOptions
{
    buildDir?: string;
    bflatExe?: string
}

export class Build
{
    langVersion?: LangVersion
    preprocessorConstants?: string[]

    sourceFiles?: string[]
    referencedILAssemblies?: string[]

    printCmd?: boolean
    objectFileOnly?: boolean
    mode?: 'exe' | 'shared' | 'il'
    arch?: 'x64' | 'arm64'
    os?: 'windows' | 'linux' | 'uefi'
    libc?: 'glibc' | 'bionic'
    optimize?: {
        space?: boolean
        speed?: boolean
    } | 'disable'
    separateSymbols?: boolean
    stdlib?: 'DotNet' | 'None' | 'Zero'
    verbose?: boolean
    /**
     * Produce deterministic outputs including timestamps
     */
    deterministic?: boolean
    aotTrimming?: {
        /**
         * Disable support for textual stack traces
         */
        noStacktraceData?: boolean
        /**
         *  Disable support for reflection
         */
        noReflection?: boolean,
        /**
         * Disable support for globalization
         */
        noGlobalization?: boolean,
        /**
         * Disable support for exception messages
         */
        noExceptionMessages?: boolean,
    }

    async run(output: string, option?: BflatBuildOptions)
    {
        const bflat = option?.bflatExe ?? await assureBflat();
        const cmd = this.buildCommand(bflat, new NM.Path(output).abs().asOsPath());
        const buildDir = option?.buildDir;
        if (buildDir)
        {
            await new NM.Path(buildDir).mkdir(
                {
                    onError: 'ignore',
                    parents: true
                }
            )
        }
        await NM.Shell.runChecked(
            cmd,
            {
                printCmd: true,
                cwd: option?.buildDir
            }
        )
    }

    buildCommand(bflatExe: string, output: string): string[]
    {
        const argv: string[] = [bflatExe];
        let isBuildingIL = false;

        this.mode ??= 'exe';
        if (this.os == undefined)
        {
            if (NM.Platform.currentOS == 'windows')
            {
                this.os = 'windows';
            }
            else if (NM.Platform.currentOS == 'linux')
            {
                this.os = 'linux';
            }
            else
            {
                NM.Log.error(`Unknown OS: ${NM.Platform.currentOS}`);
                NM.fail();
            }
        }

        if (this.arch == undefined)
        {
            if (NM.Platform.currentArch == 'x64')
            {
                this.arch = 'x64';
            }
            else if (NM.Platform.currentArch == 'arm64')
            {
                this.arch = 'arm64';
            }
            else
            {
                NM.Log.error(`Unknown arch: ${NM.Platform.currentArch}`);
                NM.fail();
            }
        }

        switch (this.mode)
        {
            case 'exe':
                argv.push("build");
                argv.push("--target");
                argv.push("Exe");

                argv.push("--arch");
                argv.push(this.arch);
                break;
            case 'shared':
                argv.push("build");
                argv.push("--target");
                argv.push("Shared");

                argv.push("--arch");
                argv.push(this.arch);
                break;
            case 'il':
                argv.push("build-il");
                isBuildingIL = true;
                break;
            default:
                NM.Log.error(`Unknown build mode: ${this.mode}`);
                NM.fail();
        }

        if (this.verbose) argv.push("--verbose");

        if (this.langVersion)
        {
            argv.push("--langversion");
            argv.push(`${this.langVersion}`);
        }

        if (this.preprocessorConstants)
        {
            for (const constant of this.preprocessorConstants)
            {
                argv.push("-d");
                argv.push(constant);
            }
        }

        if (this.referencedILAssemblies)
        {
            for (const assembly of this.referencedILAssemblies)
            {
                argv.push("-r");
                argv.push(new NM.Path(assembly).abs().asOsPath());
            }
        }

        if (this.deterministic)
            argv.push("--deterministic");

        switch (this.mode)
        {
            case "exe":
                if (this.os == 'windows')
                {
                    argv.push("--os");
                    argv.push("windows");
                    if (!output.endsWith(".exe"))
                    {
                        output += ".exe";
                    }

                    argv.push("-o");
                    argv.push(output);
                }
                else
                {
                    argv.push("--os");
                    argv.push("linux");
                    argv.push("-o");
                    argv.push(output);
                }
                break;
            case "shared":
                if (this.os == 'windows')
                {
                    argv.push("--os");
                    argv.push("windows");
                    if (!output.endsWith(".dll"))
                    {
                        output += ".dll";
                    }

                    argv.push("-o");
                    argv.push(output);
                }
                else
                {
                    argv.push("--os");
                    argv.push("linux");
                    argv.push("-o");
                    argv.push(output);
                }
                break;
            case "il":
                if (!output.endsWith(".dll"))
                {
                    output += ".dll";
                }

                argv.push("-o");
                argv.push(output);
                break;
        }

        if (this.printCmd)
            argv.push("-x");

        if (!isBuildingIL)
        {
            if (this.objectFileOnly)
            {
                argv.push("-c");
            }

            if (this.libc)
            {
                argv.push("--libc");
                argv.push(this.libc);
            }

            if (this.aotTrimming)
            {
                if (this.aotTrimming.noReflection)
                    argv.push("--no-reflection");
                if (this.aotTrimming.noGlobalization)
                    argv.push("--no-globalization");
                if (this.aotTrimming.noStacktraceData)
                    argv.push("--no-stacktrace-data");
                if (this.aotTrimming.noExceptionMessages)
                    argv.push("--no-exception-messages");
            }

            if (this.separateSymbols)
                argv.push("--separate-symbols");

            if (this.optimize == 'disable')
            {
                argv.push("-O0");
            }
            else
            {
                if (this.optimize?.space)
                {
                    if (this.os == 'linux' && this.separateSymbols === undefined)
                    {
                        NM.Log.warn(`Specify '--separate-symbols' might help greatly reduce binary size on Linux with the cost of losing some debug information.`);
                    }
                    argv.push("-Os");
                }

                if (this.optimize?.speed)
                    argv.push("-Ot");
            }
        }

        if (this.sourceFiles)
        {
            const duplicate = new Set<string>();
            for (const file of this.sourceFiles)
            {
                const p = new NM.Path(file).abs().asOsPath()
                if (duplicate.has(p)) continue;
                argv.push(p);
                duplicate.add(p);
            }
        }

        return argv;
    }
}