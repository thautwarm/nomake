import { deepStrictEqual as assertEquals } from "node:assert/strict";
import { test } from "node:test";
import { allPromisesUnderLimitedParallelism } from "../source/compat.ts";

test('limited parallelism', async () =>
{
  assertEquals(await allPromisesUnderLimitedParallelism({
    tasks: [], limit: 1
  }), []);

  async function test1(): Promise<number>
  {
    // wait for 1 seconds
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return 1;
  }
  {
    const t0 = performance.now();
    assertEquals(
      await allPromisesUnderLimitedParallelism({ tasks: [test1, test1, test1, test1], limit: 2 }),
      [1, 1, 1, 1],
    );
    const t1 = performance.now();
    assertEquals((t1 - t0) < 2500 && (t1 - t0) > 2000, true);
  }
  {
    const t0 = performance.now();
    assertEquals(
      await allPromisesUnderLimitedParallelism(
        {
          tasks: [
            test1,
            test1,
            test1,
            test1,
            test1,
          ], limit: 2
        }),
      [1, 1, 1, 1, 1],
    );
    const t1 = performance.now();
    assertEquals((t1 - t0) < 3500 && (t1 - t0) > 3000, true);
  }
});
