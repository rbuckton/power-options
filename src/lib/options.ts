import { EOL } from "os";
import * as path from "path";
import * as tty from "tty";
import { OptionResolver, CommandLineOptionProperty } from "./resolver";
import { parse } from "./parser";
import { bind, BoundArgument } from "./binder";
import { evaluate } from "./evaluator";
import { printHelp, printError } from "./printer";

const truePattern = /^(1|t(rue)?|y(es)?)$/i;

interface Map<T> { [key: string]: T; }

export interface CommandLineSettings {
    /** The command line options. */
    options: CommandLineOptionMap;
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
     * The stream to use when writing help messages when "auto" is provided. Default is process.stdout.
     */
    stdout?: NodeJS.WritableStream;
    /**
     * The stream to use when writing error messages when "auto" is provided. Default is process.stdout.
     */
    stderr?: NodeJS.WritableStream;
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
    longName?: string;
    /** The short name for the option. For example: -R */
    shortName?: string;
    /** Additional short (single character) or long names for the option. */
    alias?: string[];
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
    groups?: string[];
    /** Indicates the option should not be printed when printing help text. */
    hidden?: boolean;
    /** Indicates a string to use in help text for the argument of an option that expects a value. */
    param?: string;
    /** Indicates a string to use in help text to describe the option. */
    description?: string;
    /** Callback used to validate a supplied argument value. */
    validate?: (value: boolean | number | string, arg: string, parsedArgs: ParsedArgs) => CommandLineParseError;
    /** Callback used to convert a supplied argument value to a number or string. */
    convert?: (value: string, arg: string) => number | string | CommandLineParseError,
    /** Callback used to specify the error message to use for this option. */
    error?: (arg: string, error: CommandLineParseError) => CommandLineParseError;
    /** Callback used to generate a default value for this option. */
    defaultValue?: (parsedArgs: ParsedArgs, group: string) => ParsedArgumentType | CommandLineParseError;
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
    group?: string;
    help?: boolean;
    error?: string;
    status?: number;
}

export function parseCommandLine<T>(args: string[], settings: CommandLineSettings): ParsedCommandLine<T> {
    const resolver = new OptionResolver(settings);
    const { parsedArguments } = parse(args);
    const { boundArguments, groups } = bind(parsedArguments, resolver);
    const result = evaluate<T>(boundArguments, groups, resolver);
    if (settings.auto && (result.error || result.help)) {
        const out = (settings.stdout || process.stdout) as tty.WriteStream;
        const err = (settings.stderr || process.stderr) as tty.WriteStream;
        if (result.error && err.isTTY) printError(settings, result.error);
        if (result.help && out.isTTY) printHelp(settings, resolver);
        if (settings.auto === true) process.exit(result.status);
    }
    return result;
}