// Preserve node:fs types while converting the promise operations used by NoMake.
// @deno-types="npm:@types/node"
export * from "node:fs";
// @deno-types="npm:@types/node"
import * as nativeFs from "node:fs";
const native = nativeFs.promises;
import { fileSystemCall, fileSystemCallAsync } from "./errors.ts";

function fileHandle(handle: Awaited<ReturnType<typeof native.open>>) {
  return new Proxy(handle, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const result = fileSystemCall(() => Reflect.apply(value, target, args));
        return result && typeof (result as PromiseLike<unknown>).then === "function"
          ? fileSystemCallAsync(() => result as PromiseLike<unknown>) : result;
      };
    },
  });
}

// Read functions from the original object on every access, so instrumentation
// and fault injection still reach the actual system calls.
export const promises: typeof native = new Proxy(native, {
  get(target, key) {
    const value = Reflect.get(target, key, target);
    if (typeof value !== "function") return value;
    return (...args: unknown[]) => fileSystemCallAsync(async () => {
      const result = await Reflect.apply(value, target, args);
      return key === "open" ? fileHandle(result as Awaited<ReturnType<typeof native.open>>) : result;
    });
  },
});
