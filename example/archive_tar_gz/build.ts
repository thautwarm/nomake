import * as NM from "../../mod.ts";

const resource = NM.webArchive(
    'https://raw.githubusercontent.com/thautwarm/goto.py/d9a2e92c6206831071eac8bc7b230dbacd2b9868/goto.py',
    {
        suffixRespectUrl: true,
        directory: 'tmp'
    })

NM.target(
    {
        name: 'build',
        virtual: true,
        doc: 'Download bflat debug symbols',
        deps: [resource],
    })

NM.target(
    {
        name: "test",
        virtual: true,
        rebuild: 'always',
        doc: "Run tests",
        deps: { resource, config: 'build.ts' },
        async build({ deps })
        {
            const text = await new NM.Path(deps.resource).readText();
            const pieces = [
                "Author: Taine Zhao",
                "elif each.name == 'LOAD_GLOBAL' and globals.get(each.arg) is goto:",
                "def allow_goto(f: types.FunctionType):",
            ]
            for (const piece of pieces)
            {
                if (!text.includes(piece))
                {
                    throw new Error(`Cannot find "${piece}" in the source code.`);
                }
            }
        }
    }
)
await NM.makefile()
