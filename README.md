# bewatched 🧙‍♀️ - A directory / file watcher for Bun

This package is temporary while waiting for Bun to get a dir / watch method. It's not perfect and is probably slowish because under the hood it uses a `spawn` to traverse directories. 🤡 Once Bun implements this natively this package will be refactored to use native methods with deprecated flags - because why not just use the native methods?

## Getting started

```bash
bun add @eckidevs/bewatched
```

## Usage

```ts
import { Watcher } from '@eckidevs/bewatched'

// Create a new watcher,
// watching the current working directory
const watcher = new Watcher(process.cwd(), {
  // Ignore the 'add' event
  // when loading for the first
  // time
  ignoreInitialAdds: true, // default=false

  // Regular expression / string array
  // of paths to ignore. It matches the
  // word so e.g. `.git` will include `.gitignore`
  // use /^\.git$/ in that case
  ignorePaths: [/node_modules/, "__tests__"], // default=[]
});

// Register your listeners before running
watcher.on("ready", () => {
  console.log("The watcher has finished initialization");
});

watcher.on("error", (error: Error) => {
  // If there are not any listeners for errors,
  // the watcher will throw the error instead
  console.log("Something terrible has happened");
});

// If ignoreInitialAdds is not true
// then this will fire for every file
// discovered.
watcher.on("add", (stat: Stat) => {
  /**
   * Stat {
      type: "file";
      name: string;
      path: string;
      modified: number;
      created: number;
     }
   */
  console.log(stat)
});

watcher.on("change", (change: { updated: Stat, previous: Stat}) => {
  // The updated stat object (new modified time)
  const difference = change.updated.modifed - change.previous.modified;
  console.log(difference);
});

// Collect the initial files first
await watcher.collect();

// Watch the files
watcher.watch();

// Stop the watcher
setTimeout(() => {
  watcher.stop();
}, 5000);
```

# API

## Watcher (class)


`Watcher(root: string, options?: Options): Watcher`

root: string - The absolute path of the directory or file to start the watcher in - required.

options: Options - Initialization options
  - `ingoreInitialAdds`: boolean, default = false - When calling collect this will not emit the "add" event if true.
  - `ignorePaths`: (string|RegExp)[], default = [] - A list of directories or files to ignore. It matches the string so e.g. '.git' will also match '.gitignore'. Use a more explicit regular expression in this case.


### Properties

- files: Map<string, Stat> - available after collection
- ready: boolean - Whether initialization has completed or not
- busy: boolean - Whether the watcher is currently traversing files

### Methods

- collect: () => Promise<void> - initializes the files by crawling the starting point
- stop: () => void - Stops the watching process, but retains info in files, can be restarted with watch()
- watch: () => void - Starts the watching process

### Events

- "ready": Emitted once the `collect` function completes. Calls with no data.
- "error": Emitted if any errors occur, the process will continue watching if it can, if there are no error listeners the process throws the error. Calls / throws with an Error object.
- "add": Emitted once for every initial file discovered in `collect` process (unless ignoreInitialAdds=true) and everytime a file is add in the path provided while running. Calls with a Stat object.
- "change": Emmitted while the watcher is running and any watched files change. Calls with a { updated: Stat, previous: Stat } object


### The Stat Interface

```ts
interface Stat {
  type: "file"; // only files for now
  name: string; // The name of the last segment in the path
  path: string; // The full path of the file
  modified: number; // The unix timestamp of the modified date
  created: number; // The unix timestamp of the creation date
}
```

