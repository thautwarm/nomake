import { getExts } from "./utils.ts";

export type OS =
  | "linux"
  | "windows"
  | "macos"
  | { unknownStr: string };

export type Arch =
  | "x86"
  | "x64"
  | "arm"
  | "arm64"
  | { unknownStr: string };

export class Platform
{
  os: OS;
  arch: Arch;

  constructor(os: OS, arch: Arch)
  {
    this.os = os;
    this.arch = arch;
  }

  static get current()
  {
    return new Platform(this.currentOS, this.currentArch);
  }

  /**
   * 返回操作系统对应的换行符。
   * 当参数不指定操作系统时，返回当前操作系统的换行符。
   *
   * Return the line separator corresponding to the operating system.
   * When the operating system is not specified as a parameter, return the line separator of the current operating system.
   */
  static linesep(os?: OS): string
  {
    switch (os ?? this.currentOS)
    {
      case "linux":
      case "macos":
        return "\n";
      case "windows":
        return "\r\n";
      default:
        throw new Error(`Unknown OS: ${os}`);
    }
  }

  static pathsep(os?: OS): string
  {
    switch (os ?? this.currentOS)
    {
      case "linux":
      case "macos":
        return ":";
      case "windows":
        return ";";
      default:
        throw new Error(`Unknown OS: ${os}`);
    }
  }

  static get currentOS(): OS
  {
    switch (Deno.build.os)
    {
      case "linux":
        return "linux";
      case "windows":
        return "windows";
      case "darwin":
        return "macos";
      default:
        return { unknownStr: Deno.build.os };
    }
  }

  static get currentArch(): Arch
  {
    switch (Deno.build.arch)
    {
      case "x86_64":
        return "x64";
      case "aarch64":
        return "arm64";
      default:
        return { unknownStr: Deno.build.arch };
    }
  }
}

export function fixHostExePath(path: string)
{
  return fixExePath(path, Platform.current.os);
}

export function fixHostDllPath(path: string)
{
  return fixDllPath(path, Platform.current.os);
}

export function fixExePath(path: string, os: OS)
{
  if (os === "windows" && !path.endsWith(".exe"))
  {
    return `${path}.exe`;
  }
  return path;
}

export function fixDllPath(path: string, os: OS)
{
  switch (os)
  {
    case "windows":
      if (!path.endsWith(".dll"))
      {
        return `${path}.dll`;
      }
      break;
    case "linux":
      {
        if (!isLinuxSharedLib(path))
        {
          return `${path}.so`;
        }
        break;
      }
    case "macos":
      if (!path.endsWith(".dylib"))
      {
        return `${path}.dylib`;
      }
      break;
    default:
      break;
  }
  return path;
}

export function isLinuxSharedLib(path: string)
{
  const extensions = getExts(path, false);
  if (extensions.length == 0) return false;

  while (extensions.length > 0)
  {
    const lastExt = extensions[extensions.length - 1];
    if (lastExt === 'so') return true;
    const v = parseInt(lastExt);
    if (isNaN(v)) return false;
    extensions.pop();
  }

  return false;
}