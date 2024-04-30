import { NM } from "../hello/build.config.ts";

const assureDir = (target: string) =>
    new NM.Path(target).parent.mkdir(
        { parents: true, onError: 'existOk' }
    )


const windowsBuild = NM.target(
    {
        name: 'dist/windows-x64/example.exe',
        deps: ['example.cs'],
        async build(
            {
                target // retrieve 'name' without repeating yourself
            })
        {
            const build = new NM.Bflat.Build();
            build.mode = 'exe';
            build.os = 'windows';

            await assureDir(target)
            await build.run(target)
        }
    }
)

const linuxBuild = NM.target(
    {
        name: 'dist/linux-x64/example',
        deps: ['example.cs'],
        async build({ target })
        {
            const build = new NM.Bflat.Build();
            build.mode = 'exe';
            build.os = 'linux';

            await assureDir(target)
            await build.run(target)
        }
    }
)

NM.target(
    {
        name: 'build',
        deps: [windowsBuild, linuxBuild],
        virtual: true,
        build()
        {
            NM.Log.ok("Build finished")
        }
    }
)

NM.makefile()
