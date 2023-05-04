import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Watcher } from "../src/watcher";
import { fileURLToPath } from "bun";
import { dirname, join } from "path";
import { rmSync, rmdirSync } from "fs";

describe("watcher", () => {
  let addedFiles: string[] = [];
  const root = fileURLToPath(new URL(import.meta.url));
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
    expect(watcher.files.size).toStrictEqual(1);
    expect(watcher.files.values().next().value.name).toStrictEqual(
      "watcher.test.ts"
    );
  });

  it("watches files", (done) => {
    watcher.on("change", (data) => {
      expect(data.updated.path).toStrictEqual(root);
      done();
      watcher.stop();
    });

    watcher.watch();

    // Modify the file one second later
    setTimeout(() => {
      Bun.file(root)
        .text()
        .then((data) => {
          Bun.write(root, data);
        });
    }, 10);
  });

  it("emits add event", (done) => {
    const w = new Watcher(root);

    w.on("add", (data) => {
      expect(data.path).toStrictEqual(root);
      done();
      w.stop();
    });

    w.collect();
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
    const w = new Watcher(join(root, "../"), {
      ignoreInitialAdds: true,
    });

    w.on("add", (data) => {
      expect(data.name).toBe("test.txt");
      done();
      w.stop();
    });

    w.collect().then(() => {
      w.watch();
      Bun.write(path, "");
      addedFiles.push(path);
    });

    const path = join(
      dirname(fileURLToPath(new URL(import.meta.url))),
      "test.txt"
    );
  });
});
