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
        return await fs.promises.readFile(path, 'utf-8');
    }
    catch
    {
        /* ignore */
    }

    const bytes = await readFile(path);

    const res = tryAutoDecode(bytes);
    if (res === undefined)
        throw new Error(`Failed to read file: ${path}`);
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
    f: () => T
)
{
    if (Array.isArray(disposals))
    {
        try
        {
            return f()
        }
        finally
        {
            for (const disposal of disposals)
            {
                try
                {
                    disposal.dispose();
                }
                catch (e)
                {
                    console.log(e);
                }
            }
        }
    }
    else
    {
        try
        {
            return f()
        }
        finally
        {
            try
            {
                disposals.dispose();
            }
            catch (e)
            {
                console.log(e);
            }
        }
    }
}

export async function useAsync<T>(
    disposals: IDisposal | IDisposal[],
    f: () => Promise<T>
)
{
    if (Array.isArray(disposals))
    {
        try
        {
            return await f();
        }
        finally
        {
            for (const disposal of disposals)
            {
                try
                {
                    disposal.dispose();
                }
                catch (e)
                {
                    console.log(e);
                }
            }
        }
    }
    else
    {
        try
        {
            return await f();
        }
        finally
        {
            try
            {
                disposals.dispose();
            }
            catch (e_1)
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
