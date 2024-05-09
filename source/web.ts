import { Log } from "./log.ts";
import { Path } from "./pathlib.ts";
import { Encode, target } from "./build.ts";

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
  const resourceId = Encode.encodeB64Path(url);
  const targetNoSuffix = `${dir}/${resourceId}`;
  const targetStr = (() =>
  {
    if (options?.suffixRespectUrl)
    {
      const urlObj = new URL(url);
      const ext = new Path(urlObj.pathname).ext;
      return ext ? `${dir}/${resourceId}${ext}` : targetNoSuffix;
    } else
    {
      return targetNoSuffix;
    }
  })();

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
