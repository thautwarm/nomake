import
{
    Artifacts,
    Config,
    NM,
    targetPlatform,
    targetPlatformIdentifier,
} from "./config.build.ts";

const denoReleaseName = {
    "macos-x64": "deno-x86_64-apple-darwin.zip",
    "macos-arm64": "deno-aarch64-apple-darwin.zip",
    "linux-x64": "deno-x86_64-unknown-linux-gnu.zip",
    "linux-arm64": "deno-aarch64-unknown-linux-gnu.zip",
    "windows-x64": "deno-x86_64-pc-windows-msvc.zip",
}[targetPlatformIdentifier];

const denoArchive = NM.webArchive(
    `https://github.com/denoland/deno/releases/download/${Config.denoVersion}/${denoReleaseName}`,
    { suffixRespectUrl: true },
);

NM.target(
    {
        name: Artifacts.deno,
        rebuild: "never",
        deps: { deno: denoArchive },
        async build({ target, deps })
        {
            const targetPath = new NM.Path(target);
            await targetPath.parent.mkdir(
                {
                    onError: "ignore",
                    parents: true,
                },
            );
            await decompress(deps.deno, targetPath.parent.asOsPath());
        },
    },
);

NM.target(
    {
        name: Artifacts.nomake,
        deps: { file: "nomake.cpp" },
        async build({ target, deps })
        {
            const targetPath = new NM.Path(target);
            await targetPath.parent.mkdir(
                {
                    onError: "ignore",
                    parents: true,
                },
            );
            const compilation = new NM.CC.Compilation();
            compilation.sources = [deps.file];
            compilation.cpp = "c++17";
            // static link
            compilation.cflags = [
                "-fno-lto",
                "-static",
            ];
            compilation.optimizationLevel = 2;
            await compilation.compileExe(
                target,
                new NM.CC.Zig(
                    {
                        libc: "glibc",
                        glibcVersion: "2.17",
                        arch: targetPlatform.arch,
                        os: targetPlatform.os,
                    },
                ),
            );
        },
    },
);

async function decompress(source: string, dest: string)
{
    // call unzip to decompress the file
    if (!await NM.Shell.which("unzip"))
    {
        NM.Log.error("unzip is required to decompress the file");
        NM.fail();
    }

    await NM.Shell.runChecked(
        ["unzip", "-o", source, "-d", dest],
        {
            printCmd: true,
            logError: true,
        },
    );
}

NM.target(
    {
        name: "build",
        virtual: true,
        deps: [Artifacts.deno, Artifacts.nomake],
        build()
        {
        },
    },
);

NM.target(
    {
        name: "clean",
        virtual: true,
        async build()
        {
            await new NM.Path("tmp").rm(
                {
                    onError: "ignore",
                    recursive: true,
                },
            );
        },
    },
);

await NM.makefile();
