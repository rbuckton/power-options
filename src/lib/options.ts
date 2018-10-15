import * as tty from "tty";
import * as net from "net";
import * as chalk from "chalk";
import { EOL } from "os";
import { PassThrough } from "stream";
import { CommandLineResolver, Option, Resolver, Command } from "./resolver";
import { parse } from "./parser";
import { bind } from "./binder";
import { evaluate } from "./evaluator";
import { getPackageDetails } from "./utils";
import { HelpWriter } from "./printer";
import { CommandLineSettings, ParsedCommandLine } from "./types";
import { Queryable } from "iterable-query/es5";

export function parseCommandLine<T>(args: string[], settings: CommandLineSettings): ParsedCommandLine<T> {
    return new CommandLine(settings).parse<T>(args);
}

export class CommandLine extends CommandLineResolver {
    public readonly settings: CommandLineSettings;
    public readonly name: string;
    public readonly description: string;
    public readonly version: string;
    public readonly usages: ReadonlyArray<string>;
    public readonly examples: ReadonlyArray<string>;
    public readonly stdout: NodeJS.WritableStream;
    public readonly stderr: NodeJS.WritableStream;
    public readonly auto: boolean | "print";
    public readonly color: boolean | "force";
    public readonly width: number | undefined;
    public readonly maxWidth: number | undefined;

    private _colorStdout: boolean;
    private _colorStderr: boolean;

    constructor(settings: CommandLineSettings) {
        super(settings);
        const { auto, usage, example, color, width, maxWidth, stdout, stderr } = settings;
        const { name, description, version } = getPackageDetails(settings);
        this.settings = settings;
        this.name = name || "";
        this.description = description || "";
        this.version = version || "";
        this.auto = auto || false;
        this.color = color || false;
        this.width = width;
        this.maxWidth = maxWidth;
        this.usages = Array.isArray(usage) ? usage.slice() : usage ? [usage] : [];
        this.examples = Array.isArray(example) ? example.slice() : example ? [example] : [];
        this.stdout = pickStream(stdout, process.stdout);
        this.stderr = pickStream(stderr, process.stderr);
        this._colorStdout = color === "force" ? true : this.color && this.stdout instanceof tty.WriteStream;
        this._colorStderr = color === "force" ? true : this.color && this.stderr instanceof tty.WriteStream;
    }

    public parse<T>(args: string[]): ParsedCommandLine<T> {
        const { parsedArguments } = parse(args);
        const { boundCommand, boundArguments, groups, resolver } = bind(parsedArguments, this);
        const result = evaluate<T>(boundCommand, boundArguments, groups, resolver);
        if (this.auto && (result.error || result.help)) {
            if (result.error) this.printError(result.error);
            if (result.help) this.printHelp(result.commandPath);
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

    public printHelp(commandName?: string): void;
    public printHelp(commandName: string, ...subcommandNames: string[]): void;
    public printHelp(commandPath?: ReadonlyArray<string>): void;
    public printHelp(commandPath?: string | ReadonlyArray<string>, ...subcommandNames: string[]) {
        let resolver: Resolver = this;
        let command: Command | undefined;
        let commandQueue: Command[] | undefined;
        if (commandPath) {
            commandQueue = [];
            commandPath = typeof commandPath === "string" ? [commandPath, ...subcommandNames] : commandPath;
            for (const commandName of commandPath) {
                command = resolver.fromCommandName(commandName);
                if (!command) throw new Error(`Command '${commandName}' not found.`);
                commandQueue.push(command);
                resolver = command;
            }
        }

        const width = this.width !== undefined ? this.width : 
            this.stdout instanceof tty.WriteStream ? this.stdout.columns - 2 : 
            undefined;
        const maxWidth = this.maxWidth !== undefined ? this.maxWidth :
            this.width !== undefined ? this.width :
            undefined;
        const writer = new HelpWriter(this, command, { width, maxWidth, color: this._colorStdout });
        const commands = resolver.getCommands();
        const generalOptions = this.getOwnOptions("*");
        writer.addUsages(command ? command.usages : this.usages);
        writer.addDefaultUsage();
        writer.addDescription(command ? command.description : this.description);
        writer.addCommands(commands);
        if (commandQueue) {
            let command: Command | undefined;
            while (command = commandQueue.shift()) {
                writer.addOptions(command.getOwnOptions("*"));
            }
        }
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