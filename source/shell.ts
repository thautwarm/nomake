import * as shlex from 'npm:shlex';
import { Log } from './log.ts';
import { spawnCmd } from "./compat.ts";
import { whichCommand } from "./compat.ts";

export interface ShellExecResult
{
    success: boolean
    errorcode: number
    stderr: string
    stdout: string
}

export type ShellExecOptions = {
    /**
     * 当前工作目录
     *
     * current working directory
     *
     * 默认为 process.cwd()
     *
     * default to be process.cwd()
     */
    cwd?: string,
    /**
     * 环境变量
     *
     * environment variables
     */
    env?: Record<string, string>,
    /**
     * 超时时间，单位为毫秒，默认为 999999
     *
     * timeout in milliseconds, default to be 999999
     */
    timeout?: number,

    /**
     * 是否打印命令行
     *
     * whether to print the command line
     */
    print?: boolean

}

/**
 * 提供 Shell 相关处理。
 *
 * Provides Shell related processing.
 */
export class Shell
{
    /**
     * 将命令行字符串拆分为参数数组。
     *
     * Splits the command line string into an array of arguments.
     */

    static split(cmd: string): string[]
    {
        return shlex.split(cmd);
    }

    /**
     * 将参数数组合并为命令行字符串。
     *
     * Join the array of arguments into a command line string.
     */

    static join(cmd: string[]): string
    {
        return shlex.join(cmd);
    }

    /**
     * 将命令行字符串转义。
     *
     * Escape the command line string.
     */
    static quote(cmd: string): string
    {
        return shlex.quote(cmd);
    }

    /**
     * 运行命令行并要求成功。
     *
     * Run the command line.
     *
     * NOTE: 当命令运行不成功，抛出错误
     *
     * NOTE: the function throws an error when the command fails to run
     */
    static async runChecked(argv: string[], options?: ShellExecOptions & {
        /**
         * 是否打印错误日志
         *
         * whether to print error log
        */
        logError?: boolean
    })
    {
        const res = await Shell.run(argv, options);
        if (!res.success)
        {
            if (options?.logError)
            {
                Log.error(res.stderr, `Shell`);
            }
            Deno.exit(1);
        }
        return res.stdout;
    }

    /**
     * 运行命令行。
     *
     * Run the command line.
     *
     * NOTE: 此函数不失败，请检查返回值的 success 字段。
     *
     * NOTE: This function does not fail, please check the success field of the return value.
     */

    static async run(argv: string[], options?: ShellExecOptions): Promise<ShellExecResult>
    {



        if (options?.print)
        {
            Log.msg(`running: ${Shell.join(argv)}`, 'Shell')
        }
        return await spawnCmd(
            argv,
            {
                cwd: options?.cwd,
                env: options?.env,
            }
        )

    }

    /**
     * 查找可执行文件。
     *
     * Find the executable file.
     */
    static which(executable: string): Promise<string | undefined>
    {
        return whichCommand(executable);
    }
}
