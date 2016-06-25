import { EOL } from "os";
import * as path from "path";
import * as tty from "tty";
import * as net from "net";
import * as chalk from "chalk";
import { PassThrough } from "stream";
import { ReadonlyCollection } from "./readonly";
import { CommandResolver, Resolver, Option, Command } from "./resolver";
import { parse } from "./parser";
import { bind, BoundArgument } from "./binder";
import { evaluate } from "./evaluator";
import { getPackageDetails } from "./utils";
import { HelpWriter } from "./printer";

declare module "tty" {
    function isatty(s: NodeJS.WritableStream): s is WriteStream;
}

export interface CommandLineSettings {
    /** The program's name. Default value loaded from package.json. */
    name?: string;
    /** The program's description. Default value loaded from package.json. */
    description?: string;
    /** The program's version. Default value loaded from package.json. */
    version?: string;
    /**
     * An optional path to the program's package.json file, or a value indicating whether to
     * attempt to automatically load the program's package.json file.
     */
    package?: string | boolean;
    /** The usage message to print for the program. */
    usage?: string | string[];
    /** Examples to print for the program. */
    example?: string | string[];
    /**
     * If a help option is provided, or an error is encountered, automatically prints help or error
     * messages and exits.
     */
    auto?: boolean | "print";
    /**
     * The stream to use when writing help messages. Default is "inherit".
     */
    stdout?: "inherit" | "pipe" | NodeJS.WritableStream;
    /**
     * The stream to use when writing error messages. Default is "inherit".
     */
    stderr?: "inherit" | "pipe" | NodeJS.WritableStream;
    /**
     * A value indicating whether to print messages in color.
     */
    color?: boolean | "force";
    /** The command line options. */
    options?: CommandLineOptionMap;
    /** Commands */
    commands?: CommandLineCommandMap;
    /** An optional default parameter group. */
    defaultGroup?: string;
}

export interface CommandLineCommandMap {
    [key: string]: CommandLineCommand;
}

export interface CommandLineCommand {
    /** The name of the command. */
    commandName?: string;
    /** Aliases for the command. */
    alias?: string | string[];
    /** Options for the command. */
    options?: CommandLineOptionMap;
    /** Indicates the commend should not be printed when printing help text. */
    hidden?: boolean;
    /** The usage message to print for the program. */
    usage?: string | string[];
    /** Examples to print for the program. */
    example?: string | string[];
    /** A string to use in help text to summarize this command. */
    synopsis?: string;
    /** A string to use in help text to describe the command. */
    description?: string;
    /** An optional default parameter group. */
    defaultGroup?: string;
}

export interface CommandLineOptionMap {
    [key: string]: CommandLineOption;
}

export interface CommandLineOption {
    /** The type for the option. Default "boolean". */
    type?: "boolean" | "number" | "string";
    /** The long name for the option. For example: --remove-comments */
    longName?: string | null;
    /** The short name for the option. For example: -R */
    shortName?: string;
    /** Additional short (single character) or long names for the option. */
    alias?: string | string[];
    /** Indicates an argument whose value can be determined based on the current position. */
    position?: number;
    /** Indicates that this option is required. */
    required?: boolean;
    /** Indicates that this option is a help option. */
    help?: boolean;
    /** Indicates that the option may only be provided once. By default, for options specified more than once only the last value is used. */
    single?: boolean;
    /** Indicates whether the option can be specified more than once. The results are provided as an array. */
    multiple?: boolean;
    /** Indicates that all remaining arguments are consumed as the value of this option. */
    passthru?: boolean;
    /** Indicates that any unmatched arguments become the value of this option. */
    rest?: boolean;
    /** Indicates the valid groups for this option. */
    group?: string | string[];
    /** Indicates the option should not be printed when printing help text. */
    hidden?: boolean;
    /** A string to use in help text for the argument of an option that expects a value. */
    param?: string;
    /** A string to use in help text to describe the option. */
    description?: string;
    /** Callback used to validate a supplied argument value. */
    validate?: (value: boolean | number | string, arg: string, parsedArgs: ParsedArgs) => CommandLineParseError;
    /** Callback used to convert a supplied argument value to a number or string. */
    convert?: (value: string, arg: string) => number | string | CommandLineParseError,
    /** Callback used to specify the error message to use for this option. */
    error?: (arg: string, error: CommandLineParseError) => CommandLineParseError;
    /** Callback used to generate a default value for this option. */
    defaultValue?: (parsedArgs: ParsedArgs, group: string | undefined) => ParsedArgumentType | CommandLineParseError;
}

export interface CommandLineParseError {
    error: string;
    help?: boolean;
    status?: number;
}

export type ParsedArgumentType = string | number | boolean | string[] | number[];

export interface ParsedArgs {
    [key: string]: ParsedArgumentType;
}

export interface ParsedCommandLine<T> {
    options: T;
    commandName?: string;
    group?: string;
    help?: boolean;
    error?: string;
    status?: number;
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

        const commands = this.getCommands()
            .filter(x => !x.hidden)
            .sort(Command.compare);

        const generalOptions = this.getOwnOptions("*")
            .filter(x => !x.hidden)
            .sort(Option.compare);

        const commandOptions = commandName
            ? resolver.getOwnOptions("*")
                .filter(x => !x.hidden)
                .sort(Option.compare)
            : [];

        writer.addUsages(this.usages);
        writer.addDefaultUsage(commands.length > 0, commandOptions.length > 0 || generalOptions.length > 0);
        writer.addDescription(command ? command.description : this.description);
        if (!command) writer.addCommands(commands);
        writer.addOptions(commandOptions);
        writer.addOptions(generalOptions);
        writer.addExamples(this.examples);
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