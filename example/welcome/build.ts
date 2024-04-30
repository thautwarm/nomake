// Future versions will use branch tags to specify versions
import * as NM from '../../mod.ts'
export { NM }

const cBuild = NM.target({
    name: 'dist/windows-x64/hello.exe',
    deps: ['hello.c'], // or () => ['hello.c'] for lazy deps
    async build({ target })
    {
        const C = new NM.CC.Compilation()
        C.sources.push("hello.c")

        await assureDir(target)
        await C.compileExe(
            target,
            // cross compilation to windows
            // no matter what the host platform is
            new NM.CC.Zig({ os: 'windows' })
        )
    }
})

const csBuild = NM.target(
    {
        name: 'dist/linux-x64/libhello.so',
        deps: ['hello.cs'],
        async build({ target })
        {
            const build = new NM.Bflat.Build();
            build.mode = 'shared';
            build.os = 'linux';

            await assureDir(target)
            await build.run(target)
        }
    }
)

NM.target(
    {
        name: 'build',
        deps: [cBuild, csBuild],
        build: () => NM.Log.ok('Build Complete')
    }
)

const assureDir = (target: string) =>
    new NM.Path(target).parent.mkdir(
        { parents: true, onError: 'existOk' }
    )

NM.makefile()