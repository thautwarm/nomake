/** Options for a NoMake filesystem error. The original error remains in cause. */
export interface FileSystemErrorOptions extends ErrorOptions {
  code?: string | number;
}

type ErrorClass = new (message?: string, options?: ErrorOptions) => Error;
const denoErrors = (globalThis as { Deno?: { errors?: Record<string, ErrorClass> } }).Deno?.errors;
const instances = new WeakSet<object>();

function initialize(error: Error, name: string, code: string | number | undefined, cause: unknown) {
  error.name = name;
  Object.defineProperty(error, "cause", { value: cause, configurable: true, writable: true });
  Object.defineProperty(error, "code", { value: code, configurable: true, enumerable: true });
  instances.add(error);
  // Keep the new error's own stack. The original stack is available as cause.stack.
}

/** Common filesystem error category, including Deno-native subclasses. */
export class FileSystemError extends Error {
  declare readonly code: string | number | undefined;
  declare readonly cause: unknown;

  constructor(message?: string, options: FileSystemErrorOptions = {}) {
    super(message, { cause: options.cause });
    initialize(this, "FileSystemError", options.code, options.cause);
  }

  static override [Symbol.hasInstance](value: unknown): boolean {
    if (this === FileSystemError)
      return typeof value === "object" && value !== null && instances.has(value);
    return Function.prototype[Symbol.hasInstance].call(this, value);
  }
}

function errorClass(name: string, defaultCode?: string) {
  const Base: ErrorClass = denoErrors?.[name] ?? FileSystemError;
  return class extends Base {
    declare readonly code: string | number | undefined;
    declare readonly cause: unknown;
    constructor(message?: string, options: FileSystemErrorOptions = {}) {
      super(message, { cause: options.cause });
      initialize(this, name, options.code ?? defaultCode, options.cause);
    }
  };
}

export class NotFound extends errorClass("NotFound", "ENOENT") {}
export class AlreadyExists extends errorClass("AlreadyExists", "EEXIST") {}
export class NotADirectory extends errorClass("NotADirectory", "ENOTDIR") {}
export class IsADirectory extends errorClass("IsADirectory", "EISDIR") {}
export class PermissionDenied extends errorClass("PermissionDenied") {}
export class NotCapable extends errorClass("NotCapable") {}
export class BadResource extends errorClass("BadResource", "EBADF") {}
export class Busy extends errorClass("Busy", "EBUSY") {}
export class FilesystemLoop extends errorClass("FilesystemLoop", "ELOOP") {}
export class Interrupted extends errorClass("Interrupted", "EINTR") {}
export class InvalidData extends errorClass("InvalidData", "EINVAL") {}
export class NotSupported extends errorClass("NotSupported", "ENOTSUP") {}
export class TimedOut extends errorClass("TimedOut", "ETIMEDOUT") {}
export class WouldBlock extends errorClass("WouldBlock", "EAGAIN") {}
export class BrokenPipe extends errorClass("BrokenPipe", "EPIPE") {}
export class UnexpectedEof extends errorClass("UnexpectedEof") {}
export class WriteZero extends errorClass("WriteZero") {}

const named = { NotFound, AlreadyExists, NotADirectory, IsADirectory, PermissionDenied,
  NotCapable, BadResource, Busy, FilesystemLoop, Interrupted, InvalidData,
  NotSupported, TimedOut, WouldBlock, BrokenPipe, UnexpectedEof, WriteZero };
type NoMakeErrorConstructor = new (message?: string, options?: FileSystemErrorOptions) => FileSystemError;
const codes: Record<string, NoMakeErrorConstructor> = {
  ENOENT: NotFound, EEXIST: AlreadyExists, ENOTDIR: NotADirectory, EISDIR: IsADirectory,
  EACCES: PermissionDenied, EPERM: PermissionDenied, EBADF: BadResource, EBUSY: Busy,
  ELOOP: FilesystemLoop, EINTR: Interrupted, EINVAL: InvalidData,
  ENOTSUP: NotSupported, EOPNOTSUPP: NotSupported, ENOSYS: NotSupported,
  ETIMEDOUT: TimedOut, EAGAIN: WouldBlock, EWOULDBLOCK: WouldBlock, EPIPE: BrokenPipe,
};

/** Convert at a filesystem boundary only; already converted errors keep identity. */
export function toFileSystemError(cause: unknown): FileSystemError {
  if (cause instanceof FileSystemError) return cause;
  const originalCode = (cause as { code?: unknown } | null)?.code;
  const code = typeof originalCode === "string" || typeof originalCode === "number" ? originalCode : undefined;
  const message = cause instanceof Error ? cause.message : String(cause);
  let Type = typeof code === "string" && Object.hasOwn(codes, code) ? codes[code] : undefined;
  if (!Type && denoErrors) {
    for (const [name, Constructor] of Object.entries(named)) {
      const Native = denoErrors[name];
      if (Native && cause instanceof Native) { Type = Constructor; break; }
    }
  }
  return new (Type ?? FileSystemError)(message, { code, cause });
}

/** Synchronous filesystem boundary. */
export function fileSystemCall<T>(operation: () => T): T {
  try { return operation(); }
  catch (error) { throw toFileSystemError(error); }
}

/** Asynchronous filesystem boundary, including synchronous invocation failures. */
export async function fileSystemCallAsync<T>(operation: () => T | PromiseLike<T>): Promise<T> {
  try { return await operation(); }
  catch (error) { throw toFileSystemError(error); }
}
