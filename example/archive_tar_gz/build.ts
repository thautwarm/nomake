import * as NM from "../../mod.ts";

const resource = NM.webArchive(
    'https://github.com/bflattened/bflat/releases/download/v8.0.2/bflat-8.0.2-linux-glibc-arm64-debugsymbols.tar.gz',
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

await NM.makefile()
