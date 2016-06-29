/**
 * Settings that control how to parse command line arguments.
 */
export interface CommandLineSettings {
    /**
     * The program's name. Default value loaded from package.json.
     */
    name?: string;

    /**
     * The program's description. Default value loaded from package.json.
     */
    description?: string;

    /**
     * The program's version. Default value loaded from package.json.
     */
    version?: string;

    /**
     * An optional path to the program's package.json file, or a value indicating whether to
     * attempt to automatically load the package.json file relative to the main module.
     */
    package?: string | boolean;

    /**
     * The usage message or messages to print for the program.
     */
    usage?: string | string[];

    /**
     * Examples to print for the program.
     * */
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

    /**
     * General options parsed on the command line.
     */
    options?: CommandLineOptionMap;

    /**
     * Commands with individual command line options.
     **/
    commands?: CommandLineCommandMap;

    /**
     * An optional default parameter group.
     */
    defaultGroup?: string;

    /**
     * Named sets of reusable command-line options.
     */
    optionSets?: CommandLineOptionSets;
}

/**
 * Named command commands.
 */
export interface CommandLineCommandMap {
    [key: string]: CommandLineCommand;
}

/**
 * Describes a command, for programs that can perform multiple different behaviors.
 */
export interface CommandLineCommand {
    /**
     * The name of the command. If not specified, the key provided in the CommandLineCommandMap
     * will be used.
     */
    commandName?: string;

    /**
     * Aliases for the command.
     */
    alias?: string | string[];

    /**
     * Includes named option sets.
     */
    include?: string | string[];

    /**
     * Options for the command.
     */
    options?: CommandLineOptionMap;

    /**
     * Option sets for the command.
     * NOTE: These are not included by default. To include them you must specify an "include".
     */
    optionSets?: CommandLineOptionSets;

    /**
     * Indicates the commend should not be printed when printing help text.
     */
    hidden?: boolean;

    /**
     * The usage message to print for the program.
     */
    usage?: string | string[];

    /**
     * Examples to print for the program.
     */
    example?: string | string[];

    /**
     * A string to use in help text to summarize this command.
     */
    summary?: string;

    /**
     * A string to use in help text to describe the command in detail.
     */
    description?: string;

    /**
     * An optional default parameter group.
     */
    defaultGroup?: string;
}

export interface CommandLineOptionSets {
    [key: string]: CommandLineOptionSet;
}

export interface CommandLineOptionSet {
    setName?: string;
    hidden?: boolean;
    merge?: boolean;
    options?: CommandLineOptionMap;
}

/**
 * Named command line options.
 */
export interface CommandLineOptionMap {
    [key: string]: CommandLineOption;
}

/**
 * A command line option.
 */
export interface CommandLineOptionBase<TValue, TDefault> {
    /**
     * The type for the option. Default "boolean".
     */
    type?: "boolean" | "number" | "string";

    /**
     * The long name for the option. For example: --remove-comments
     */
    longName?: string | null;

    /**
     * The short name for the option. For example: -R
     */
    shortName?: string;

    /**
     * Additional short (single character) or long names for the option.
     */
    alias?: string | string[];

    /**
     * Indicates an argument whose value can be determined based on the current position.
     */
    position?: number;

    /**
     * Indicates that this option is required.
     */
    required?: boolean;

    /**
     * Indicates that the option may only be provided once. By default, for options specified
     * more than once only the last value is used.
     */
    single?: boolean;

    /**
     * Indicates the valid groups for this option.
     */
    group?: string | string[];

    /**
     * Indicates the option should not be printed when printing help text.
     */
    hidden?: boolean;

    /**
     * A string to use in help text to describe the option.
     */
    description?: string;

    /**
     * Callback used to convert a supplied argument value.
     */
    convert?: (value: string, parameterName: string) => TValue,

    /**
     * Callback used to validate a supplied argument value.
     */
    validate?: (value: TValue, parameterName: string, parsedArgs: any) => CommandLineParseError | void;

    /**
     * Callback used to specify the error message to use for this option.
     */
    error?: ((parameterName: string, error: CommandLineParseError) => CommandLineParseError) | CommandLineParseErrorDefinition | string;

    /**
     * Callback used to generate a default value for this option.
     */
    defaultValue?: ((parsedArgs: any, group: string | undefined) => TDefault) | TDefault;
}

export interface CommandLineOptionWithValueBase<TValue, TDefault> extends CommandLineOptionBase<TValue, TDefault> {
    /**
     * Indicates whether the option can be specified more than once. The results are provided as
     * an array.
     */
    multiple?: boolean;

    /**
     * Maps an argument to a specific value.
     */
    map?: CommandLineValueMap<TValue>;

    /**
     * Specifies whether option value matching should be case-insensitive.
     */
    ignoreCase?: boolean;

    /**
     * Validates that the value is one of the supplied values.
     */
    in?: TValue[];

    /**
     * A string to use in help text for the argument of an option that expects a value.
     */
    param?: string;
}

export interface CommandLineBooleanOptionBase extends CommandLineOptionBase<boolean, boolean> {
    /**
     * Indicates that this option is a help option. Only one option may be declared as a help
     * option.
     */
    help?: boolean;
}

export interface CommandLineStringOptionBase extends CommandLineOptionWithValueBase<string, string | string[]> {
    /**
     * Indicates that all remaining arguments are consumed as the value of this option. Only one
     * option may declared as a passthru option.
     */
    passthru?: boolean;

    /**
     * Indicates that any unmatched arguments become the value of this option.
     */
    rest?: boolean;

    /**
     * A regular expression pattern that the option must match.
     */
    match?: RegExp | string;
}

export interface CommandLineNumberOptionBase extends CommandLineOptionWithValueBase<number, number | number[]> {
}

export interface CommandLineBooleanOption extends CommandLineBooleanOptionBase {
    /**
     * The type for the option.
     */
    type: "boolean";
}

export interface CommandLineStringOption extends CommandLineStringOptionBase {
    /**
     * The type for the option.
     */
    type: "string";
}

export interface CommandLineNumberOption extends CommandLineNumberOptionBase {
    /**
     * The type for the option.
     */
    type: "number";
}

export type CommandLineUnspecifiedOption = CommandLineBooleanOptionBase & CommandLineStringOptionBase & CommandLineNumberOptionBase;
export type CommandLineOption = CommandLineBooleanOption | CommandLineStringOption | CommandLineNumberOption | CommandLineUnspecifiedOption;

export interface CommandLineValueMap<T> {
    [key: string]: T;
}

export interface CommandLineParseErrorDefinition {
    message: string;
    help?: boolean;
    status?: number;
}

export class CommandLineParseError extends Error {
    public readonly name = "CommandLineParseError";
    public help: boolean;
    public status: number | undefined;

    constructor(message?: string, help: boolean = false, status: number = -1) {
        super(message);
        this.help = help || false;
        this.status = status;
    }
}

export type ParsedArgumentType = string | number | boolean | string[] | number[];

export interface ParsedCommandLine<T> {
    options: T;
    commandName?: string;
    command?: CommandLineCommand;
    group?: string;
    help?: boolean;
    error?: string;
    status?: number;
}

export interface ReadonlyCollection<T> extends ReadonlyArray<T>, Iterable<T> {
}

export interface ReadonlySet<T> extends Iterable<T> {
    readonly size: number;
    has(value: T): boolean;
    keys(): IterableIterator<T>;
    values(): IterableIterator<T>;
    entries(): IterableIterator<[T, T]>;
}

export interface ReadonlyMap<K, V> extends Iterable<[K, V]> {
    readonly size: number;
    has(key: K): boolean;
    get(key: K): V | undefined;
    keys(): IterableIterator<K>;
    values(): IterableIterator<V>;
    entries(): IterableIterator<[K, V]>;
}