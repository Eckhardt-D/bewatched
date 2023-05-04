import { Bench } from "tinybench";
import { fileURLToPath } from "url";
import { statSync } from "fs";

const bench = new Bench({ time: 100 });

await bench
  .add("fs.statSync", () => {
    statSync(fileURLToPath(import.meta.url));
  })
  .add("Bun.spawnSync ls (will be slow)", async () => {
    Bun.spawn(["ls", "-al", fileURLToPath(import.meta.url)]);
  })
  .run();

console.table(bench.table());
