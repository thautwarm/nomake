export * from './source/log.ts'
export * from './source/build.ts'
export * from './source/pathlib.ts'
export * from './source/platform.ts'
export * from './source/shell.ts'
export * from './source/env.ts'
import * as CC from './source/ctoolchain.ts'
export {
    /**
     * The C/C++ compiler toolchain.
     */
    CC
}
export { autoReadFile, exit } from './source/utils.ts'
