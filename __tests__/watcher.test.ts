import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Watcher } from "../src/watcher";
import { fileURLToPath } from "bun";
import { dirname, join } from "path";
import { rmSync } from "fs";

describe("watcher", () => {
  let addedFiles: string[] = [];
  const root = join(
    dirname(fileURLToPath(new URL(import.meta.url))),
    "fixtures"
  );
  let watcher: Watcher;

  beforeAll(async () => {
    watcher = new Watcher(root);
    await watcher.collect();
  });

  afterAll(() => {
    if (addedFiles.length) {
      addedFiles.forEach((p) => rmSync(p));
    }
    watcher.stop();
  });

  it("contains list of files", () => {
    expect(watcher.files.size).toStrictEqual(2);
    expect(watcher.files.values().next().value.name).toStrictEqual("file.json");
  });

  it("watches files", (done) => {
    watcher.on("change", (data) => {
      expect(data.updated.path).toStrictEqual(root + "/file.json");
      done();
      watcher.stop();
    });

    watcher.watch();

    // Modify the file one second later
    setTimeout(() => {
      Bun.file(root + "/file.json")
        .text()
        .then((data) => {
          Bun.write(root + "/file.json", data);
        });
    }, 10);
  });

  it("emits add event", async (done) => {
    const w = new Watcher(root);

    w.on("add", (data) => {
      expect(data.path).toBeDefined();
      done();
      w.stop();
    });

    await w.collect();
  });

  it("emits error event", (done) => {
    const w = new Watcher("nonexistingfile.txt");
    w.on("error", (e) => {
      expect(e.message).toStrictEqual(
        "Could not find path: nonexistingfile.txt"
      );
      done();
      w.stop();
    });
    w.collect();
  });

  it("emits when file is added after the fact", (done) => {
    const w = new Watcher(root, {
      ignoreInitialAdds: true,
    });

    w.on("add", (data) => {
      expect(data.name).toBe("test2.txt");
      done();
      w.stop();
    });

    w.collect().then(() => {
      w.watch();
      Bun.write(root + "/test2.txt", "");
      addedFiles.push(root + "/test2.txt");
    });
  });

  it("ignores given paths", async () => {
    const w = new Watcher(process.cwd(), {
      ignorePaths: [/node_modules/],
    });

    await w.collect();

    const files = w.files;
    let hasNodeModules = false;

    for (const value of files) {
      if (value[0].includes("node_modules")) {
        hasNodeModules = true;
      }
    }

    expect(hasNodeModules).toBe(false);
  });
});
