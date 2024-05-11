import { Path } from './pathlib.ts';

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
  const timestamp = ANSIColor.purple(
    now.toDateString() + " " + now.toLocaleTimeString(),
  );
  switch (level)
  {
    case "ok":
      mainMsg = ANSIColor.green(mainMsg);
      break;
    case "info":
      mainMsg = ANSIColor.blue(mainMsg);
      break;
    case "error":
      mainMsg = ANSIColor.red(mainMsg);
      break;
    case "warn":
      mainMsg = ANSIColor.yellow(mainMsg);
      break;
    case "verbose":
      mainMsg = ANSIColor.orange(mainMsg);
      break;
    default:
      break;
  }
  console.log(`${timestamp} ${mainMsg}`);
}


export type LogLevel = "ok" | "info" | "error" | "warn" | "normal" | "verbose";

export interface Transport
{
  severity: Record<LogLevel, number>
  level: LogLevel
  log(msg: string, level: LogLevel, title?: string): void;
}

class FileTransport implements Transport
{
  severity: Record<LogLevel, number>;
  level: LogLevel;
  levelAsNum: number;
  filepath: Path;

  constructor(filepath: string | Path, severity: Record<LogLevel, number>, level: LogLevel)
  {
    if (!(filepath instanceof Path))
    {
      filepath = new Path(filepath);
    }

    this.severity = severity
    this.level = level
    this.levelAsNum = severity[level] ?? 2
    this.filepath = filepath
  }

  log(msg: string, level: LogLevel, title?: string | undefined): void
  {
    title ??= "Log";
    const levelAsNum = this.severity[level] ?? 2;
    if (levelAsNum < this.levelAsNum)
    {
      return;
    }
    const mainMsg = `${new Date().toDateString()} [${title}]: ${msg}\n`;
    const file = this.filepath;
    try
    {

      Deno.writeTextFileSync(file.asOsPath(), mainMsg, { append: true });
    }
    catch
    {
      defaultMessage('error', `Failed to write to file ${file}`, title)
    }
  }
}

class ConsoleTransport implements Transport
{
  level: LogLevel;
  levelAsNum: number;
  _severity?: Record<LogLevel, number>;

  get severity()
  {
    this._severity ??= Object.assign({}, defaultLogSeverity);
    return this._severity;
  }

  constructor(level: LogLevel)
  {
    this.level = level
    this.levelAsNum = defaultLogSeverity[level] ?? defaultLogSeverity.normal;
  }

  log(msg: string, level: LogLevel, title?: string | undefined): void
  {
    title ??= "Log";
    const levelAsNum = this.severity[level] ?? 2;
    if (levelAsNum < this.levelAsNum)
    {
      return;
    }
    defaultMessage(level, msg, title);
  }
}

function getDefaultLogLevel(): LogLevel
{
  const level = Deno.env.get("NOMAKE_LOG_LEVEL");
  if (!level) return "normal";
  switch (level.toLocaleLowerCase())
  {
    case "ok":
      return "ok";
    case "info":
      return "info";
    case "error":
      return "error";
    case "warn":
      return "warn";
    case "verbose":
      return "verbose";
    default:
      defaultMessage("warn", `Invalid log level: ${level}. Using \`normal\` instead.`);
      return "normal";
  }
}

export interface TransportParams
{
  severity?: Record<LogLevel, number>;
  level?: LogLevel;
}

export type TransportLike = Transport | string | Path

const defaultLogLevel = getDefaultLogLevel();
const defaultLogSeverity: Record<LogLevel, number> = {
  ok: 6,
  error: 5,
  warn: 4,
  info: 3,
  normal: 2,
  verbose: 1,
}

export class Log
{
  private static title?: string;
  private static transports: Set<Transport> = new Set([new ConsoleTransport(defaultLogLevel)]);
  static DefaultLogSeverity: Record<LogLevel, number> = defaultLogSeverity

  static addTransport(transport: Transport | string | Path, options?: TransportParams): Transport
  {
    if (typeof transport === 'string')
    {
      transport = new Path(transport)
    }

    if (transport instanceof Path)
    {
      transport = new FileTransport(
        transport,
        options?.severity ?? Log.DefaultLogSeverity,
        options?.level ?? defaultLogLevel
      );
    }
    Log.transports.add(transport);
    return transport;
  }

  static rmTransport(it: Transport)
  {
    Log.transports.delete(it);
  }

  static group(title: string)
  {
    const oldTitle = Log.title;
    Log.title = title;
    return () =>
    {
      Log.title = oldTitle;
    };
  }

  static async useAsync<T>(
    targets: TransportLike | TransportLike[],
    f: () => Promise<T>,
  )
  {
    if (Array.isArray(targets))
    {
      const loggers: Transport[] = [];
      for (const target of targets)
      {
        loggers.push(Log.addTransport(target));
      }

      try
      {
        return await f();
      } finally
      {
        for (const each of loggers)
        {
          Log.rmTransport(each);
        }
      }
    } else
    {
      const logger = Log.addTransport(targets);
      try
      {
        return await f();
      } finally
      {
        Log.rmTransport(logger);
      }
    }
  }

  static msg(msg: string, title?: string)
  {
    title ??= Log.title;
    for (const transport of Log.transports)
    {
      transport.log(msg, "normal", title);
    }
  }

  static ok(msg: string, title?: string)
  {
    title ??= Log.title;
    for (const transport of Log.transports)
    {
      transport.log(msg, "ok", title);
    }
  }

  static info(msg: string, title?: string)
  {
    title ??= Log.title;
    for (const transport of Log.transports)
    {
      transport.log(msg, "info", title);
    }
  }

  static error(msg: string, title?: string)
  {
    title ??= Log.title;
    for (const transport of Log.transports)
    {
      transport.log(msg, "error", title);
    }
  }

  static warn(msg: string, title?: string)
  {
    title ??= Log.title;
    for (const transport of Log.transports)
    {
      transport.log(msg, "warn", title);
    }
  }

  static verbose(msg: string, title?: string)
  {
    title ??= Log.title;
    for (const transport of Log.transports)
    {
      transport.log(msg, "verbose", title);
    }
  }
}
