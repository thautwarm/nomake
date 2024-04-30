import * as NM from "../../mod.ts";

const deps = ['include/mylib.h', 'otherSources/mylib.c', 'someSources/main.c']

NM.target(
    {
        name: 'dist/zig/myapp',
        deps,
        async build()
        {
            const C = new NM.CC.Compilation()
            C.includeDirs.push("include")
            C.sources.push("otherSources/mylib.c")

            C.optimizationLevel = 1;

            await C.compileSharedLib(
                'dist/zig/myapp',
                new NM.CC.Zig()
            )
        }
    }
)

NM.target(
    {
        name: 'dist/gcc/myapp',
        deps,
        async build()
        {
            const C = new NM.CC.Compilation()
            C.includeDirs.push("include")
            C.sources.push("otherSources/mylib.c")
            C.sources.push("someSources/main.c")

            C.optimizationLevel = 1;

            await C.compileExe(
                'dist/gcc/myapp',
                new NM.CC.GCC()
            )
        }
    }
)

NM.target(
    {
        name: 'dist/cmake',
        deps,
        async build()
        {
            const C = new NM.CC.Compilation()
            C.includeDirs.push("include")
            C.sources.push("otherSources/mylib.c")
            C.sources.push("someSources/main.c")

            C.optimizationLevel = 1;

            await C.dumpCmake(
                {
                    mode: 'exe',
                    dest: 'dist/cmake',
                    name: 'myapp',
                },
            )
        }
    }
)

NM.makefile()