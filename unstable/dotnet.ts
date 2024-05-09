import { NM } from "../example/hello/build.config.ts";
import { SemVer } from "../mod.ts";

export type DotNetSDKVer =
  | "netstandard2.0"
  | "netstandard2.1"
  | "net6"
  | "net7"
  | "net8";

export async function assureDotnetExe()
{
  const dotnet = await NM.Shell.which("dotnet");
  if (!dotnet)
  {
    NM.Log.error("dotnet not found!");
    const message = [
      [
        "Please install dotnet SDK. The following ways are recommanded:",
        "* https://dotnet.microsoft.com/download/dotnet",
      ],
    ];
    if (NM.Platform.currentOS == "windows")
    {
      message.push(["* 'scoop install dotnet-sdk' via Scoop"]);
      NM.Log.error(message.join("\n"));
    } else if (NM.Platform.currentOS == "linux")
    {
      const assureUbuntu = await NM.Shell.run(
        ["uname", "-a"],
        {
          stdout: "capture",
          printCmd: false,
        },
      )
        .then((res) => res.success && res.stdout.includes("Ubuntu"))
        .catch(() => false);
      if (assureUbuntu)
      {
        message.push(["* sudo apt install -y dotnet-sdk-8.0"]);
      }

      NM.Log.error(message.join("\n"));
    }
    NM.fail();
  }
  return dotnet;
}

export async function getDotnetSDKs(): Promise<
  { tag: DotNetSDKVer; semver: SemVer.SemVer }[]
>
{
  const dotnet = await assureDotnetExe();

  const output = await NM.Shell.runChecked(
    [dotnet, "--list-sdks"],
    {
      printCmd: true,
      stdout: "capture",
    },
  );

  const lines = output
    .trim()
    .split(NM.Platform.linesep())
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const sdks: { tag: DotNetSDKVer; semver: SemVer.SemVer }[] = [];
  for (const line of lines)
  {
    const lB = line.indexOf("[");
    if (lB === -1)
    {
      NM.Log.warn(`Potential invalid dotnet output: ${line}`);
      continue;
    }

    try
    {
      const ver = SemVer.parse(line.substring(1, lB - 1));
      switch (ver.major)
      {
        case 6:
          sdks.push({ tag: "net6", semver: ver });
          break;
        case 7:
          sdks.push({ tag: "net7", semver: ver });
          break;
        case 8:
          sdks.push({ tag: "net8", semver: ver });
          break;
        default:
          NM.Log.warn(`Unsupported dotnet SDK version: ${ver.major}`);
          break;
      }
    } catch
    {
      NM.Log.warn(`Failed to parse dotnet SDK version: ${line}`);
    }
  }

  return sdks;
}

async function findCurSDK()
{
  const sdks = await getDotnetSDKs();
  sdks.sort((a, b) => SemVer.compare(a.semver, b.semver));
  return sdks[sdks.length - 1];
}

export interface ProjectInitParams
{
  sdkVersion?: DotNetSDKVer;
  langVersion?: string;
  constants?: string[];
  mode?: "exe" | "lib";
  excludePattern?: string[];
}

export class Project
{
  sdkVersion: DotNetSDKVer;
  langVersion: string;
  constants: Set<string>;
  mode: "exe" | "lib";
  excludePattern: string[];

  static async create(options?: ProjectInitParams)
  {
    const sdkVersion = options?.sdkVersion ?? (await findCurSDK()).tag;
    const langVersion = options?.langVersion ?? "latest";
    const constants = options?.constants ?? [];
    const mode = options?.mode ?? "exe";
    const excludePattern = options?.excludePattern ?? [];
    return new Project(
      {
        sdkVersion,
        langVersion,
        constants,
        mode,
        excludePattern,
      },
    );
  }

  /**
   * Use `Project.create` instead.
   */
  private constructor(
    args: {
      sdkVersion: DotNetSDKVer;
      langVersion: string;
      constants: string[];
      mode: "exe" | "lib";
      excludePattern: string[];
    },
  )
  {
    this.sdkVersion = args.sdkVersion;
    this.langVersion = args.langVersion;
    this.constants = new Set(args.constants);
    this.mode = args.mode;
    this.excludePattern = args.excludePattern;
  }

  *genCSProj()
  {
    yield `<Project Sdk="Microsoft.NET.Sdk">`;
    if (this.excludePattern)
    {
      yield `  <ItemGroup>`;
      for (const pattern of this.excludePattern)
      {
        yield `    <Compile Remove="${pattern}" />`;
      }
      yield `  </ItemGroup>`;
    }
    yield `  <PropertyGroup>`;
    if (this.mode == "exe")
    {
      yield `    <OutputType>Exe</OutputType>`;
    } else
    {
      yield `    <OutputType>Library</OutputType>`;
    }
    switch (this.sdkVersion)
    {
      case "netstandard2.0":
        yield `    <TargetFramework>netstandard2.0</TargetFramework>`;
        break;
      case "netstandard2.1":
        yield `    <TargetFramework>netstandard2.1</TargetFramework>`;
        break;
      case "net6":
        yield `    <TargetFramework>net6.0</TargetFramework>`;
        break;
      case "net7":
        yield `    <TargetFramework>net7.0</TargetFramework>`;
        break;
      case "net8":
        yield `    <TargetFramework>net8.0</TargetFramework>`;
        break;
    }

    throw new Error("not implemented yet");
  }
}
