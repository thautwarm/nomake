import * as NM from "../../mod.ts";
//  "https://raw.githubusercontent.com/thautwarm/nomakefile/main/mod.ts";
export { NM }

export const Artifacts = {
    CFile: 'hello.c',
    Exe: NM.Platform.currentOS == 'windows' ? 'build/hello.exe' : 'build/hello'
}