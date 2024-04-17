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