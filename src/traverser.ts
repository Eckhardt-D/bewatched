import { Files, Stat, Watcher } from "./watcher";
import { stat } from "fs/promises";

const getPaths = async (path: string) => {
  /* This is the main reason for this lib,
   * until Bun gets a Dir method
   * or native Watch method. ls is slooow,
   * but does the trick for now.
   */
  const proc = Bun.spawn(["ls", "-al", path]);
  return new Response(proc.stdout).text();
};

const paths: Record<
  string,
  { size: number; output: string; isDirectory: boolean; modified: Date }
> = {};

const cachedLs = async (path: string) => {
  const stats = await stat(path);
  const isDirectory = stats.isDirectory();

  if (!paths[path]) {
    paths[path] = {
      output: await getPaths(path),
      size: stats.size,
      modified: stats.mtime,
      isDirectory,
    };
    return paths[path];
  }

  if (isDirectory) {
    if (paths[path].modified.getTime() !== stats.mtime.getTime()) {
      // TODO: possibly look at a 'deleted' event here 🤔
      paths[path].output = await getPaths(path);
      paths[path].modified = stats.mtime;
    }
  }

  return paths[path];
};

export async function traverser(
  startingPath: string,
  files: Files,
  ignorePaths: (string | RegExp)[],
  ignoreInitialAdds: boolean,
  watcher: Watcher
) {
  const lsResponse = await cachedLs(startingPath);

  let output: string | undefined = lsResponse.output;
  const lines = output.split("\n");
  output = undefined;

  lines.pop();
  // Cheapish way to see if directory
  // to remove total, . and ..
  // TODO: refactor
  if (lsResponse.isDirectory) {
    lines.shift();
    lines.shift();
    lines.shift();
  }

  for (const line of lines) {
    const name = line.split(/\s+/).at(-1);

    if (!name) {
      continue;
    }

    const fullPath = `${startingPath}/${name}`;

    if (ignorePaths.some((path) => fullPath.match(path))) {
      continue;
    }

    const stats = await stat(fullPath);
    const modified = stats.mtime.getTime();

    const fileStat: Stat = {
      modified,
      created: stats.birthtime.getTime(),
      name,
      path: fullPath,
      type: "file",
    };

    if (stats.isFile()) {
      const exists = files.has(fullPath);
      if (!exists) {
        if (!ignoreInitialAdds) {
          watcher._emit("add", fileStat);
        }
      } else {
        const previous = files.get(fullPath)!;
        if (previous.modified !== fileStat.modified) {
          watcher._emit("change", { updated: fileStat, previous });
        }
      }

      files.set(fullPath, fileStat);
    }

    if (stats.isDirectory()) {
      await traverser(fullPath, files, ignorePaths, ignoreInitialAdds, watcher);
    }
  }

  return files;
}
