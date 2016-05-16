import { OptionResolver, CommandLineOptionProperty } from "./resolver";
import { parse } from "./parser";
import { bind, BoundArgument } from "./binder";
import { evaluate } from "./evaluator";

const truePattern = /^(1|t(rue)?|y(es)?)$/i;

interface Map<T> { [key: string]: T; }

export interface CommandLineSettings {
    /** The command line options. */
    options: CommandLineOptionMap;
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

export function parseCommandLine<T>(args: string[], settings: CommandLineSettings, defaultGroup?: string): ParsedCommandLine<T> {
    const resolver = new OptionResolver(settings.options, defaultGroup);
    const { parsedArguments } = parse(args);
    const { boundArguments, groups } = bind(parsedArguments, resolver);
    return evaluate<T>(boundArguments, groups, resolver);
}