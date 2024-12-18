import * as NM from "../mod.ts";

export { NM };

export const Config = {
  denoVersion: "v2.1.4",
};

function belong<U extends string, T extends U>(
  elements: readonly T[],
  e: U,
): e is T
{
  return elements.includes(e as T);
}

const curPlatform = (() =>
{
  const cur = NM.Platform.current;
  const os = cur.os;
  const arch = cur.arch;
  if (typeof os !== "string" || !belong(["windows", "macos", "linux"], os))
  {
    NM.Log.error(`Unknown OS: ${os}`);
    NM.exit(1);
  }

  if (typeof arch !== "string" || !belong(["x64", "arm64"], arch))
  {
    NM.Log.error(`Unknown arch: ${arch}`);
    NM.exit(1);
  }
  return { os, arch };
})();

const userSpecified: {
  arch?: "arm64" | "x64";
  os?: "windows" | "linux" | "macos";
} = {};

NM.option("BUILD_ARCH", ({ value }) =>
{
  switch (value.toLowerCase())
  {
    case "arm64":
    case "aarch64":
      userSpecified.arch = "arm64";
      break;
    case "x64":
    case "x86_64":
    case "amd64":
      userSpecified.arch = "x64";
      break;
    default:
      NM.Log.error(`Unknown architecture: ${value}`, "ARCH");
      break;
  }
});

NM.option("BUILD_OS", ({ value }) =>
{
  switch (value.toLowerCase())
  {
    case "win":
    case "win32":
    case "windows":
      userSpecified.os = "windows";
      break;
    case "linux":
      userSpecified.os = "linux";
      break;
    case "osx":
    case "macos":
    case "darwin":
      userSpecified.os = "macos";
      break;
    default:
      NM.Log.error(`Unknown OS: ${value}`, "OS");
      break;
  }
});

NM.parseOptions();

export const targetPlatform: {
  arch: "arm64" | "x64";
  os: "windows" | "linux" | "macos";
} = {
  arch: userSpecified.arch ?? curPlatform.arch,
  os: userSpecified.os ?? curPlatform.os,
};

export const targetPlatformIdentifier = (() =>
{
  const res = `${targetPlatform.os}-${targetPlatform.arch}` as const;
  if (res === "windows-arm64")
  {
    NM.Log.error(`Deno does not support Windows ARM64 yet.`);
    NM.exit(1);
  }
  return res;
})();

function fixExeSuffix(name: string)
{
  return targetPlatform.os === "windows" ? `${name}.exe` : name;
}

export const Artifacts = {
  deno: fixExeSuffix(`tmp/release/${targetPlatformIdentifier}/deno`),
  nomake: fixExeSuffix(`tmp/release/${targetPlatformIdentifier}/nomake`),
};
