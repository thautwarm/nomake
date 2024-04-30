// TODO: Implement transports

export interface ILogger
{
    level: string;
}

class ANSIColor
{
    static red(s: string)
    {
        return `\x1b[31m${s}\x1b[0m`;
    }
    static green(s: string)
    {
        return `\x1b[32m${s}\x1b[0m`;
    }

    static yellow(s: string)
    {
        return `\x1b[33m${s}\x1b[0m`;
    }

    static orange(s: string)
    {
        return `\x1b[38;5;208m${s}\x1b[0m`;
    }

    static blue(s: string)
    {
        return `\x1b[34m${s}\x1b[0m`;
    }

    static purple(s: string)
    {
        return `\x1b[35m${s}\x1b[0m`;
    }
}

function defaultMessage(level: string, message: string, title?: string)
{
    title ??= "Log";
    let mainMsg = `[${title}]: ${message}`;
    const now = new Date();
    const timestamp = ANSIColor.purple(now.toDateString() + " " + now.toLocaleTimeString());
    switch (level)
    {
        case 'ok':
            mainMsg = ANSIColor.green(mainMsg);
            break;
        case 'info':
            mainMsg = ANSIColor.blue(mainMsg);
            break;
        case 'error':
            mainMsg = ANSIColor.red(mainMsg);
            break;
        case 'warn':
            mainMsg = ANSIColor.yellow(mainMsg);
            break;
        case 'verbose':
            mainMsg = ANSIColor.orange(mainMsg);
            break;
        default:
            break;
    }
    console.log(`${timestamp} ${mainMsg}`)
}

export interface Transport
{
    filename: string
    level?: 'ok' | 'info' | 'error' | 'warn' | 'normal' | 'verbose'
}

export class Log
{
    static title?: string
    static addTransport(transport: Transport): ILogger
    {
        Log.warn("Transport not implemented yet")
        return {
            level: transport.level ?? 'normal'
        }
    }

    static rmTransport(_: ILogger)
    {
        Log.warn("Transport not implemented yet")
    }

    static group(title: string)
    {
        const oldTitle = Log.title;
        Log.title = title;
        return () =>
        {
            Log.title = oldTitle;
        }
    }

    static async useAsync<T>(targets: Transport | Transport[], f: () => Promise<T>)
    {
        if (Array.isArray(targets))
        {
            const loggers: ILogger[] = [];
            for (const target of targets)
                loggers.push(Log.addTransport(target) as ILogger);

            try
            {
                return await f();
            }
            finally
            {
                for (const each of loggers)
                    Log.rmTransport(each);
            }
        }
        else
        {
            const logger = Log.addTransport(targets);
            try
            {
                return await f();
            }
            finally
            {
                Log.rmTransport(logger);
            }
        }
    }

    static msg(msg: string, title?: string)
    {
        title ??= Log.title;
        defaultMessage('normal', msg, title);
    }

    static ok(msg: string, title?: string)
    {
        title ??= Log.title;
        defaultMessage('ok', msg, title);
    }

    static info(msg: string, title?: string)
    {
        title ??= Log.title;
        defaultMessage('info', msg, title);
    }

    static error(msg: string, title?: string)
    {
        title ??= Log.title;
        defaultMessage('error', msg, title);
    }

    static warn(msg: string, title?: string)
    {
        title ??= Log.title;
        defaultMessage('warn', msg, title);
    }

    static verbose(msg: string, title?: string)
    {
        title ??= Log.title;
        defaultMessage('verbose', msg, title);
    }
}