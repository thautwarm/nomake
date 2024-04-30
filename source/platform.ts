export type OS =
    | 'linux'
    | 'windows'
    | 'macos'
    | { unknownStr: string };

export type Arch =
    | 'x86'
    | 'x64'
    | 'arm'
    | 'arm64'
    | { unknownStr: string };

export class Platform
{
    os: OS;
    arch: Arch;

    constructor(os: OS, arch: Arch)
    {
        this.os = os;
        this.arch = arch;
    }

    static get current()
    {
        return new Platform(this.currentOS, this.currentArch);
    }

    /**
     * 返回操作系统对应的换行符。
     * 当参数不指定操作系统时，返回当前操作系统的换行符。
     *
     * Return the line separator corresponding to the operating system.
     * When the operating system is not specified as a parameter, return the line separator of the current operating system.
     */
    static linesep(os?: OS): string
    {
        switch (os ?? this.currentOS)
        {
            case 'linux':
            case 'macos':
                return '\n';
            case 'windows':
                return '\r\n';
            default:
                throw new Error(`Unknown OS: ${os}`);
        }
    }

    static pathsep(os?: OS): string
    {
        switch (os ?? this.currentOS)
        {
            case 'linux':
            case 'macos':
                return ':';
            case 'windows':
                return ';';
            default:
                throw new Error(`Unknown OS: ${os}`);
        }
    }

    static get currentOS(): OS
    {

        switch (Deno.build.os)
        {
            case 'linux':
                return 'linux';
            case 'windows':
                return 'windows';
            case 'darwin':
                return 'macos';
            default:
                return { unknownStr: Deno.build.os };
        }
    }

    static get currentArch(): Arch
    {
        switch (Deno.build.arch)
        {
            case 'x86_64':
                return 'x64';
            case 'aarch64':
                return 'arm64';
            default:
                return { unknownStr: Deno.build.arch };
        }
    }


    // static get currentOS(): OS
    // {
    //     switch (process.platform)
    //     {
    //         case 'linux':
    //             return 'linux';
    //         case 'win32':
    //             return 'windows';
    //         case 'darwin':
    //             return 'macos';
    //         default:
    //             return { unknownStr: process.platform };
    //     }
    // }

    // static get currentArch(): Arch
    // {
    //     switch (process.arch)
    //     {
    //         case 'ia32':
    //             return 'x86';
    //         case 'x64':
    //             return 'x64';
    //         case 'arm':
    //             return 'arm';
    //         case 'arm64':
    //             return 'arm64';
    //         default:
    //             return { unknownStr: process.arch };
    //     }
    // }
}