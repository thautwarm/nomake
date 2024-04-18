import { constrainedMemory } from "node:process";
import { NM, Artifacts } from "./build.config.ts";

NM.target({
    name: Artifacts.CFile,
    deps: [ 'helloMsg.txt' ],
    async build() {
        const message = await new NM.Path('helloMsg.txt').readText('utf-8');
        const sourceCode = [
            `#include <stdio.h>`,
            `int main()`,
            `{`,
            `    printf("${message}\\n");`,
            `    return 0;`,
            `}`
        ].join("\n")

        await new NM.Path('hello.c').writeText(sourceCode, 'utf-8');
    }
})

NM.target({
    name: Artifacts.Exe,
    deps: [Artifacts.CFile],
    async build() {
        const cc = await NM.Shell.which("cc");
        if (!cc) {
            NM.Log.error("no C compiler found, exit")
            Deno.exit(1);
        }

        await new NM.Path(Artifacts.Exe).parent.mkdir({
            parents: true,
            onError: 'ignore'
        })

        await NM.Shell.runChecked(
            [
                "cc", "hello.c", "-o", Artifacts.Exe
            ],
            { printCmd: true }
        )
    }
})

NM.target({
    name: 'build',
    virtual: true,
    deps: [Artifacts.Exe],
    build() {
        NM.Log.info("Build finished")
    }
})

NM.target({
    name: 'run',
    virtual: true,
    rebuild: 'always',
    deps: [Artifacts.Exe],
    async build() {
        NM.Log.info("Running the program...")
        await NM.Shell.run([Artifacts.Exe], { printCmd: true })
    }
})


NM.makefile(Deno.args)