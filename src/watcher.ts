import { statSync, existsSync } from "fs";
import { join } from "path";
const ignored: (string | RegExp)[] = [];

export type Stat = {
  type: "file";
  name: string;
  path: string;
  modified: number;
  created: number;
};

type Options = {
  ignoreInitialAdds?: boolean;
  ignorePaths?: (string | RegExp)[];
};

type WatcherEvent = "ready" | "error" | "change" | "add";

type WatcherCallback<T extends WatcherEvent> = T extends "ready"
  ? () => void
  : T extends "error"
  ? (error: Error) => void
  : T extends "change"
  ? ({ updated, previous }: { updated: Stat; previous: Stat }) => void
  : T extends "add"
  ? (data: Stat) => void
  : never;

export class Watcher {
  private root: string;
  private _files: Map<string, Stat>;
  private _ready: boolean = false;
  private _busy: boolean = false;
  private _stopped: boolean = false;
  private _ignoreInitialAdds: boolean = false;
  private _listeners: Map<WatcherEvent, WatcherCallback<WatcherEvent>[]> =
    new Map<WatcherEvent, WatcherCallback<WatcherEvent>[]>();

  constructor(root: string, options?: Options) {
    this.root = root;
    this._files = new Map();

    if (options?.ignoreInitialAdds) {
      this._ignoreInitialAdds = options.ignoreInitialAdds;
    }

    if (options?.ignorePaths) {
      options.ignorePaths?.forEach((path) => {
        ignored.push(path);
      });
    }
  }

  get ready() {
    return this._ready;
  }

  get busy() {
    return this._busy;
  }

  get files() {
    return this._files;
  }

  private emitOrThrowError(error: Error) {
    if (!this._listeners.get("error")) {
      throw error;
    } else {
      this._emit("error", error);
    }
  }

  stop() {
    this._stopped = true;
  }

  private _emit<T extends WatcherEvent>(
    event: T,
    data?: Parameters<WatcherCallback<T>>[0]
  ) {
    if (this._listeners.has(event)) {
      const callbacks = this._listeners.get(event)!;
      for (const callback of callbacks) {
        // @ts-ignore: Stat & Error seems incorrect?
        callback(data);
      }
    }
  }

  on<T extends WatcherEvent>(event: T, callback: WatcherCallback<T>) {
    if (this._listeners.has(event)) {
      const currentCallbacks = this._listeners.get(event);
      currentCallbacks!.push(callback);
      this._listeners.set(event, currentCallbacks!);
      return this;
    }

    this._listeners.set(event, [callback]);
    return this;
  }

  private async _walk(
    currentPath: string,
    ignoreAdds = this._ignoreInitialAdds
  ) {
    if (!existsSync(currentPath)) {
      return this.emitOrThrowError(
        new Error("Could not find path: " + currentPath)
      );
    }
    this._busy = true;
    /* This is the main reason for this lib,
     * until Bun gets a Dir method
     * or native Watch method. ls is slooow,
     * but does the trick for now.
     */
    const proc = Bun.spawn(["ls", "-al", currentPath]);
    const output = await new Response(proc.stdout).text();
    const lines = output.split("\n");

    lines.pop();

    // Cheapish way to see if directory
    // to remove total, . and ..
    // TODO: refactor
    if (lines[1]?.at(-1) === ".") {
      lines.shift();
      lines.shift();
      lines.shift();
    }

    for await (const line of lines) {
      let parts: string[] | undefined = line.split(/\s+/);
      const isDirectory = parts[0][0] === "d";
      const name = parts.at(-1)!;
      const shouldIgnore = ignored.some((path) => {
        return name?.match(path) || currentPath.match(path);
      });
      parts = undefined;

      if (isDirectory) {
        if (shouldIgnore) {
          continue;
        }
        await this._walk(join(currentPath, name));
        // TODO: watch directories too? for delete event
        continue;
      }

      if (shouldIgnore) {
        continue;
      }

      // This means the watcher is given a single file
      const fullPath = currentPath === name ? name : join(currentPath, name);
      let stat;

      try {
        stat = statSync(fullPath, {
          throwIfNoEntry: true,
        });
      } catch (error) {
        this.emitOrThrowError(error as Error);
        continue;
      }

      const modified = stat.mtime.getTime();

      const myStat: Stat = {
        created: stat.birthtime.getTime(),
        modified,
        name: fullPath.split("/").at(-1)!,
        path: fullPath,
        type: "file",
      };

      const exists = this._files.has(fullPath);

      if (exists) {
        const previous = this._files.get(fullPath)!;

        if (previous.modified < modified) {
          this._emit("change", {
            updated: myStat,
            previous,
          });
        }
      } else {
        if (!ignoreAdds) {
          this._emit("add", myStat);
        }
      }

      this._files.set(fullPath, myStat);
    }
  }

  async collect(): Promise<void> {
    await this._walk(this.root);
    this._ready = true;
    this._busy = false;
    this._emit("ready");
  }

  watch() {
    if (!this._ready) {
      this.emitOrThrowError(
        Error("Could not start watch, not initialized. Did you call `collect`?")
      );
      return;
    }

    if (!this._busy) {
      this._walk(this.root, false).then(() => {
        this._busy = false;
      });
    }

    if (this._stopped) {
      return;
    }

    setTimeout(() => {
      this.watch();
    }, 100);
  }

  print() {
    for (const file of this._files) {
      console.log(file[1]);
    }
  }
}
