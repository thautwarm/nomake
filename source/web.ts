import { Log } from "./log.ts";
import { Path } from "./pathlib.ts";
import { target } from "./build.ts";
import { urlToValidFileName } from "./utils.ts";

export class Web
{
  static async download(
    options: {
      url: string;
      path: Path;
      noPrint?: boolean;
    },
  )
  {
    if (!options?.noPrint)
    {
      Log.verbose(`Downloading ${options.url} to ${options.path.asPosix()}...`);
    }

    options.path.parent.mkdir({
      parents: true,
      onError: "ignore",
      mode: 0o755,
    });

    const res = await fetch(options.url);
    const ab = await res.arrayBuffer();
    await Deno.writeFile(options.path.asPosix(), new Uint8Array(ab));

    Log.ok(`Downloaded ${options.url} to ${options.path.asPosix()}`);
  }
}

export interface WebArchiveOptions
{
  directory?: string;
  suffixRespectUrl?: boolean;
}

export function webArchive(url: string, options?: WebArchiveOptions)
{
  const dir = options?.directory ?? "tmp/web";
  const resourceId = urlToValidFileName(url);
  const targetStr = `${dir}/${resourceId}`;

  return target(
    {
      name: targetStr,
      rebuild: "never",
      doc: `Download ${url}`,
      async build({ target })
      {
        const targetPath = new Path(target);
        await Web.download({ url, path: targetPath });
      },
    },
  );
}
