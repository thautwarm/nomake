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
 * console.log(Deno.env.get("POST")) // "8080"
 * console.log(env.PORT) // "8080"
 * env.PORT = "";
 * console.log(Deno.env.get("POST")) // ""
 * console.log(env.PORT) // ""
 * ```
 */
export abstract class Env
{
    static create<E extends Record<string, string | undefined>>(defaults: E): IEnv<E>
    {
        const o = {};
        for (const k in defaults)
        {
            // if the environment variable is not set and the default value
            // is not undefined, set the default value
            if (!Deno.env.has(k) && defaults[k] !== undefined)
            {
                Deno.env.set(k, defaults[k]!)
            }

            // define getter and setter for each environment variable
            Object.defineProperty(
                o, k, {
                get()
                {
                    return Deno.env.get(k) ?? defaults[k]
                },
                set: (v: string | undefined) =>
                {
                    // empty string "" is not treated
                    // as undefined
                    if (v !== undefined)
                    {
                        Deno.env.set(k, v)
                    }
                    else
                    {
                        Deno.env.delete(k)
                    }
                }
            })
        }

        return o as IEnv<E>;
    }
}


export type IEnv<E> = {
    [variable in keyof E]: string | undefined
}
