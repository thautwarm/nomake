import { fs, readFile, tryAutoDecode } from "./compat.ts";

/**
 * 自动读取文件并返回内容为字符串，不需要指定编码。
 *
 * Automatically read a file and return the content as a string without specifying the encoding.
 *
 * 依次尝试使用以下编码读取文件，直到成功为止：utf-8, gbk, gb2312, gb18030, big5
 *
 * Try to read the file using the following encodings in order until successful: utf-8, gbk, gb2312, gb18030, big5
 */
export async function autoReadFile(path: string)
{
  try
  {
    return await fs.promises.readFile(path, "utf-8");
  }
  catch
  {
    /* ignore */
  }

  const bytes = await readFile(path);

  const res = tryAutoDecode(bytes);
  if (res === undefined)
  {
    throw new Error(`Failed to read file: ${path}`);
  }
  return res;
}

export function forAll<T>(xs: Iterable<T>, pred: (x: T) => boolean): boolean
{
  for (const x of xs)
  {
    if (!pred(x))
    {
      return false;
    }
  }
  return true;
}

export function equalU8Array(a: Uint8Array, b: Uint8Array): boolean
{
  if (a.length !== b.length)
  {
    return false;
  }
  for (let i = 0; i < a.length; i++)
  {
    if (a[i] !== b[i])
    {
      return false;
    }
  }
  return true;
}

export interface IDisposal
{
  dispose(): void;
}

export function use<T>(
  disposals: IDisposal | IDisposal[],
  f: () => T,
)
{
  if (Array.isArray(disposals))
  {
    try
    {
      return f();
    } finally
    {
      for (const disposal of disposals)
      {
        try
        {
          disposal.dispose();
        } catch (e)
        {
          console.log(e);
        }
      }
    }
  } else
  {
    try
    {
      return f();
    } finally
    {
      try
      {
        disposals.dispose();
      } catch (e)
      {
        console.log(e);
      }
    }
  }
}

export async function useAsync<T>(
  disposals: IDisposal | IDisposal[],
  f: () => Promise<T>,
)
{
  if (Array.isArray(disposals))
  {
    try
    {
      return await f();
    } finally
    {
      for (const disposal of disposals)
      {
        try
        {
          disposal.dispose();
        } catch (e)
        {
          console.log(e);
        }
      }
    }
  } else
  {
    try
    {
      return await f();
    } finally
    {
      try
      {
        disposals.dispose();
      } catch (e_1)
      {
        console.log(e_1);
      }
    }
  }
}

/**
 * 以指定的退出码退出进程。
 * 如需允许其他构建以试错的方式继续执行，请使用 fail()
 *
 * Exit the process with the specified exit code.
 * You might use fail() if you want to allow other
 * build targets to continue in a try-catch manner.
 */
export function exit(code: number): never
{
  Deno.exit(code);
}

export function never(x: never): never
{
  throw new Error(`Unreachable: ${x}`);
}

// 基于 python pathlib 中的规范
export function getExts(path: string, returnPrefixDot: boolean)
{
  if (path.endsWith(".")) return [];
  path = _lstrip(path, ".");

  const sections = path.split(".").slice(1);
  if (returnPrefixDot)
  {
    return sections.map((ext) => `.${ext}`);
  } else
  {
    return sections;
  }
}

function _lstrip(s: string, chars: string)
{
  let i = 0;
  while (i < s.length && chars.includes(s[i]))
  {
    i++;
  }
  return s.slice(i);
}

export function urlToValidFileName(url: string)
{
  let buffer;
  let i = 0;
  if (url.startsWith("https://"))
  {
    i = "https://".length;
    buffer = "0"
  }
  else if (url.startsWith("http://"))
  {
    i = "http://".length;
    buffer = "1"
  }
  else
  {
    buffer = "2"
  }

  for (; i < url.length; i++)
  {
    const c = url[i];
    switch (c)
    {
      case "%":
        buffer += "=";
        break;
      case "/":
        buffer += "!";
        break;
      case '.':
      case '_':
      case '-':
        buffer += c;
        break;
      default:
        if ('a' <= c && c <= 'z' || '0' <= c && c <= '9')
        {
          buffer += c;
        }
        else if ('A' <= c && c <= 'Z')
        {
          buffer += '+' + c.toLowerCase();
        }
        else
        {
          buffer += `@${c.codePointAt(0)?.toString(16)}`;
        }
    }
  }
  return buffer;
}

/**
 * 检测对象是否为限定取值下的字符串
 *
 * Check if the object is a string under the specified values
 */
export function inOptions<T, U extends T & string>(arg: T, options: U[]): arg is U
{
  if (typeof arg === 'string') {
    // deno-lint-ignore no-explicit-any
    return options.includes(<any>arg);
  }
  return false;
}
