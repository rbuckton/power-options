import { EOL } from "os";
import * as path from "path";
import * as tty from "tty";
import * as net from "net";
import * as chalk from "chalk";
import { PassThrough } from "stream";
import { CommandResolver, Resolver, Option, Command } from "./resolver";
import { parse } from "./parser";
import { bind, BoundArgument } from "./binder";
import { evaluate } from "./evaluator";
import { getPackageDetails } from "./utils";
import { HelpWriter } from "./printer";
import { CommandLineSettings, ParsedCommandLine, ReadonlyCollection } from "./types";

declare module "tty" {
    function isatty(s: NodeJS.WritableStream): s is WriteStream;
}


export function parseCommandLine<T>(args: string[], settings: CommandLineSettings): ParsedCommandLine<T> {
    return new CommandLine(settings).parse<T>(args);
}

export class CommandLine extends CommandResolver {
    public readonly settings: CommandLineSettings;
    public readonly name: string;
    public readonly description: string;
    public readonly version: string;
    public readonly usages: ReadonlyCollection<string>;
    public readonly examples: ReadonlyCollection<string>;
    public readonly stdout: NodeJS.WritableStream;
    public readonly stderr: NodeJS.WritableStream;
    public readonly auto: boolean | "print";
    public readonly color: boolean | "force";

    private _colorStdout: boolean;
    private _colorStderr: boolean;

    constructor(settings: CommandLineSettings) {
        super(settings);
        const { auto, usage, example, color, stdout, stderr } = settings;
        const { name, description, version } = getPackageDetails(settings);
        this.settings = settings;
        this.name = name || "";
        this.description = description || "";
        this.version = version || "";
        this.auto = auto || false;
        this.color = color || false;
        this.usages = Array.isArray(usage) ? usage.slice() : usage ? [usage] : [];
        this.examples = Array.isArray(example) ? example.slice() : example ? [example] : [];
        this.stdout = pickStream(stdout, process.stdout);
        this.stderr = pickStream(stderr, process.stderr);
        this._colorStdout = color === "force" ? true : this.color && tty.isatty(this.stdout);
        this._colorStderr = color === "force" ? true : this.color && tty.isatty(this.stderr);
    }

    public parse<T>(args: string[]): ParsedCommandLine<T> {
        const { parsedArguments } = parse(args);
        const { boundCommand, boundArguments, groups, resolver } = bind(parsedArguments, this);
        const result = evaluate<T>(boundCommand, boundArguments, groups, resolver);
        if (this.auto && (result.error || result.help)) {
            const out = (this.stdout || process.stdout) as tty.WriteStream;
            const err = (this.stderr || process.stderr) as tty.WriteStream;
            if (result.error) this.printError(result.error);
            if (result.help) this.printHelp(result.commandName);
            if (this.auto === true) process.exit(result.status);
        }
        return result;
    }

    public printError(error: string) {
        let message = `abort: ${error}${EOL}`;
        if (this._colorStderr) {
            message = chalk.bold.red(message);
        }

        this.stderr.write(message, "utf8");
    }

    public printHelp(commandName?: string) {
        const command = commandName ? this.fromCommandName(commandName) : undefined;
        if (commandName && !command) throw new Error(`Command '${commandName}' not found.`);

        const resolver = command || this;
        const width = tty.isatty(this.stdout) ? this.stdout.columns - 2 : 120;
        const writer = new HelpWriter(this, command, { width, color: this._colorStdout });
        const commands = this.getCommands();
        const generalOptions = this.getOwnOptions("*");
        const commandOptions: Iterable<Option> = command ? command.getOwnOptions("*") : [];

        writer.addUsages(command ? command.usages : this.usages);
        writer.addDefaultUsage();
        writer.addDescription(command ? command.description : this.description);
        if (!command) writer.addCommands(commands);
        writer.addOptions(commandOptions);
        writer.addOptions(generalOptions);
        writer.addExamples(command ? command.examples : this.examples);
        writer.write(this.stdout);
    }
}

function pickStream(stdio: "inherit" | "pipe" | number | NodeJS.WritableStream | undefined, inherit: NodeJS.WritableStream) {
    if (typeof stdio === "string" || stdio === undefined) {
        switch (stdio) {
            case "pipe": return new PassThrough({ encoding: "utf8" });
            default: return inherit;
        }
    }
    else if (typeof stdio === "number") {
        return new net.Socket({ fd: stdio, writable: true } as any);
    }
    else {
        return stdio;
    }
}