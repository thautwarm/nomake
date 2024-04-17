import * as mod from './mod.ts';

mod.Log.info("Hello, world!")
mod.Path.cwd().do(p => console.log(p))