import { NM } from "../hello/build.config.ts";

const windowsBuild = NM.target(
    {
        name: 'dist/windows-x64/example.exe',
        deps: ['example.cs'],
        async build()
        {
            const build = new NM.Bflat.Build();
            build.mode = 'exe';
            build.os = 'windows';

            await new NM.Path('dist/windows-x64').mkdir(
                {
                    parents: true,
                    onError: 'existOk'
                }
            )

            await build.run('dist/windows-x64/example.exe')
        }
    }
)

const linuxBuild = NM.target(
    {
        name: 'dist/linux-x64/example.exe',
        deps: ['example.cs'],
        async build()
        {
            const build = new NM.Bflat.Build();
            build.mode = 'exe';
            build.os = 'linux';

            await new NM.Path('dist/linux-x64').mkdir(
                {
                    parents: true,
                    onError: 'existOk'
                }
            )

            await build.run('dist/linux-x64/example')
        }
    }
)

NM.target(
    {
        name: 'build',
        deps: [windowsBuild, linuxBuild],
        virtual: true,
        async build()
        {

        }
    }
)

NM.makefile()
