import * as NM from "../../mod.ts";

const repo1 = NM.repoTarget(
    {
        repo: "raysan5/raylib",
    });

NM.target(
    {
        name: "build",
        deps: [repo1],
        rebuild: "always",
        build({ deps })
        {
            const path = deps[0];
            NM.Log.info(`Cloning raylib at ${path}`, "build");
        },
    });

await NM.makefile();
