import process from "node:process";
/**
 * 创建可静态检查、OOP 式的环境变量管理器
 *
 * Create an environment variable manager that is statically checked and conforms to OOP style
 *
 * @example
 * ```ts
 * const env = Env.create({
 *    PORT: "8080",
 *    HOST: "localhost"
 * })
 *
 * console.log(process.env["PORT"]) // "8080"
 * console.log(env.PORT) // "8080"
 * env.PORT = "";
 * console.log(process.env["PORT"]) // ""
 * console.log(env.PORT) // ""
 * ```
 */
export abstract class Env
{
  static create<E extends Record<string, string | undefined>>(
    defaults: E,
  ): IEnv<E>
  {
    const o = {};
    for (const k in defaults)
    {
      // if the environment variable is not set and the default value
      // is not undefined, set the default value
      if (process.env[k] === undefined && defaults[k] !== undefined)
      {
        process.env[k] = defaults[k]!;
      }

      // define getter and setter for each environment variable
      Object.defineProperty(
        o,
        k,
        {
          get()
          {
            return process.env[k] ?? defaults[k];
          },
          set: (v: string | undefined) =>
          {
            // empty string "" is not treated
            // as undefined
            if (v !== undefined)
            {
              process.env[k] = v;
            } else
            {
              delete process.env[k];
            }
          },
        },
      );
    }

    return o as IEnv<E>;
  }
}

export type IEnv<E> = {
  [variable in keyof E]: string | undefined;
};
