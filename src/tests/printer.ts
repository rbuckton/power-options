import * as path from "path";
import { PassThrough, Writable } from "stream";
import { EOL } from "os";
import { assert, expect } from "chai";
import { theory } from "./utils";
import { CommandLine, CommandLineSettings } from "../lib/index";
import { baseline } from "./baseline";

const settings: CommandLineSettings = {
    name: "test",
    options: {
        "a": { shortName: "a", longName: null, description: "The -a option" },
        "b": { type: "string", description: "The --b option" },
        "c": { type: "number", description: "The --c option.\nOn two lines." },
        "d": { type: "string", multiple: true, param: "param", description: "The --d option with a <param>." },
        "x": { type: "string", position: 0 },
        "gab": { type: "boolean", group: ["a", "b"], position: 1 },
        "gbc": { type: "boolean", group: ["b", "c"], position: 2 },
        "gac": { type: "boolean", group: ["a", "c"], position: 3 },
        "rest": { rest: true },
        "pass": { passthru: true }
    },
    commands: {
        "z": { summary: "The 'z' command." },
        "w": {
            summary: "The 'w' command.",
            options: {
                "wa": { type: "string" }
            },
            commands: {
                "v": {
                    summary: "The 'v' command.",
                    options: {
                        "va": { type: "string" }
                    }
                }
            }
        }
    }
};

const options = { base: path.resolve(__dirname, "../../baselines") };

describe("printHelp()", () => {
    it("monochrome", async () => {
        const stdout = new PassThrough({ encoding: "utf8" });
        new CommandLine(Object.assign({ }, settings, { stdout })).printHelp();
        stdout.end();
        await baseline(options, "printHelp-monochrome.txt", stdout);
    });
    it("color", async () => {
        const stdout = new PassThrough({ encoding: "utf8" });
        new CommandLine(Object.assign({ }, settings, { stdout, color: "force", width: 190 })).printHelp();
        stdout.end();
        await baseline(options, "printHelp-color.txt", stdout);
    });
});

describe("printHelp(command)", () => {
    it("monochrome", async () => {
        const stdout = new PassThrough({ encoding: "utf8" });
        new CommandLine(Object.assign({ }, settings, { stdout })).printHelp("z");
        stdout.end();
        await baseline(options, "printHelp-command-monochrome.txt", stdout);
    });
    it("color", async () => {
        const stdout = new PassThrough({ encoding: "utf8" });
        new CommandLine(Object.assign({ }, settings, { stdout, color: "force", width: 190 })).printHelp("z");
        stdout.end();
        await baseline(options, "printHelp-command-color.txt", stdout);
    });
});

describe("printHelp(subcommand)", () => {
    it("monochrome", async () => {
        const stdout = new PassThrough({ encoding: "utf8" });
        new CommandLine(Object.assign({ }, settings, { stdout })).printHelp("w", "v");
        stdout.end();
        await baseline(options, "printHelp-subcommand-monochrome.txt", stdout);
    });
    it("color", async () => {
        const stdout = new PassThrough({ encoding: "utf8" });
        new CommandLine(Object.assign({ }, settings, { stdout, color: "force", width: 190 })).printHelp("w", "v");
        stdout.end();
        await baseline(options, "printHelp-subcommand-color.txt", stdout);
    });
});

describe("printError()", () => {
    it("monochrome", async () => {
        const stderr = new PassThrough({ encoding: "utf8" });
        new CommandLine(Object.assign({ }, settings, { stderr })).printError("failed");
        stderr.end();
        await baseline(options, "printError-monochrome.txt", stderr);
    });
    it("color", async () => {
        const stderr = new PassThrough({ encoding: "utf8" });
        new CommandLine(Object.assign({ }, settings, { stderr, color: "force" })).printError("failed");
        stderr.end();
        await baseline(options, "printError-color.txt", stderr);
    });
});