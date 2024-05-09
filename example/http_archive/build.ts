import * as NM from "../../mod.ts";
import { Config, targetPlatformIdentifier } from "./build.config.ts";

const denoReleaseName = {
    "macos-x64": "deno-x86_64-apple-darwin.zip",
    "macos-arm64": "deno-aarch64-apple-darwin.zip",
    "linux-x64": "deno-x86_64-unknown-linux-gnu.zip",
    "linux-arm64": "deno-aarch64-unknown-linux-gnu.zip",
    "windows-x64": "deno-x86_64-pc-windows-msvc.zip",
}[targetPlatformIdentifier];

const denoArchive = NM.webArchive(
    `https://github.com/denoland/deno/releases/download/${Config.denoVersion}/${denoReleaseName}`,
    { suffixRespectUrl: true },
);

NM.target(
    {
        name: "install-deno",
        virtual: true,
        deps: [denoArchive],
        build({ deps })
        {
            const path = deps[0];
            NM.Log.info(`Installing deno at ${path}`, "install-deno");
        },
    });

await NM.makefile();
