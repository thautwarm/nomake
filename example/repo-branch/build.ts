import * as NM from "../../mod.ts";

const bdwgc = NM.repoTarget(
    {
        repo: 'ivmai/bdwgc',
        gitOptions: { branch: 'v8.2.6' }
    }
)

NM.target(
    {
        name: 'build',
        virtual: true,
        deps: {
            bdwgc,
        },
        build()
        {
            NM.Log.info('Cloned bdwgc', 'build')
        }
    }
)

await NM.makefile()
