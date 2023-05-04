import { statSync, existsSync } from "fs";
import { join } from "path";
import { traverser } from "./traverser";

const ignored: (string | RegExp)[] = [];
let timeout: Timer;

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

export type Files = Map<string, Stat>;

export class Watcher {
  private root: string;
  private _files: Files;
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

  _emit<T extends WatcherEvent>(
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
  ): Promise<void> {
    if (!existsSync(currentPath)) {
      return this.emitOrThrowError(
        new Error("Could not find path: " + currentPath)
      );
    }

    this._busy = true;
    await traverser(currentPath, this._files, ignored, ignoreAdds, this);
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

    if (timeout) {
      clearTimeout(timeout);
    }

    if (!this._busy) {
      this._walk(this.root, false).then(() => {
        this._busy = false;
      });
    }

    if (this._stopped) {
      return;
    }

    timeout = setTimeout(() => {
      this.watch();
    }, 34);
  }

  print() {
    for (const file of this._files) {
      console.log(file[1]);
    }
  }
}
