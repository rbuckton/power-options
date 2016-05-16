# power-options
CLI Option parser for NodeJS

This library contains an advanced CLI option parser for NodeJS console applications.

# Installing
For the latest version:

```
npm install power-options
```

# Usage

```ts
// Importing (TypeScript)
import { parseCommandLine } from "power-options";

// Importing (JavaScript - CommonJS)
const parseCommandLine = require("power-options").parseCommandLine;

// Usage
const { options, help, error, status, group } = parseCommandLine(process.argv.slice(2), {
    options: {
        "help": { shortName: "h", alias: ["?"], help: true },
        "version": { shortName: "v" },
    }
});

if (error) {
    console.error(error);
    if (help) {
        // print help
    }
    process.exit(status);
}
else if (help) {
    // print help
    process.exit(0);
}
else {
    // use options/group
}
```