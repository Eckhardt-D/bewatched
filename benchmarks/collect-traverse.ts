import { Watcher } from "../index";
import { traverser } from "../src/traverser";
import { Bench } from "tinybench";

const w = new Watcher(process.cwd());

const bench = new Bench({ time: 100 });

await bench
  .add("watcher implementation", async () => {
    await w.collect();
  })
  .add("traverser implementation", async () => {
    await traverser(process.cwd(), new Map(), [], false, w);
  })
  .run();

console.table(bench.table());
