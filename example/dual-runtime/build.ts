import * as NM from "@nomake/core";

NM.option("GREETING", ({ value }) => { greeting = value; });
let greeting = "Hello";
NM.parseOptions();

const generated = NM.target({
  name: "build/dual-runtime/greeting.txt",
  deps: { input: "example/dual-runtime/input.txt" },
  async build({ deps, target })
  {
    const output = new NM.Path(target);
    await output.parent.mkdir({ parents: true, onError: "existOk" });
    const name = (await new NM.Path(deps.input).readText()).trim();
    await output.writeText(`${greeting}, ${name}!\n`);
  },
});

NM.target({
  name: "hello",
  virtual: true,
  rebuild: "always",
  deps: { generated },
  async build({ deps })
  {
    console.log(await new NM.Path(deps.generated).readText());
  },
});

await NM.makefile();
