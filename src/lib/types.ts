export type CommandLineExecCallback = (parsedCommandLine: ParsedCommandLine<any>, context: any) => void | PromiseLike<void>;
export type CommandLineConvertCallback<T> = (value: string, parameterName: string) => T;
export type CommandLineValidateCallback<T> = (value: T, parameterName: string, parsedArgs: any) => CommandLineParseError | undefined | void;
export type CommandLineErrorCallback = (parameterName: string, error: CommandLineParseError) => CommandLineParseError;
export type CommandLineDefaultValueCallback<T> = (parsedArgs: any, group: string | undefined) => T | undefined;
export type CommandLineVisibility = "visible" | "advanced" | "hidden";
export type CommandPath = [string, ...string[]];

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
     * A value indicating the width of the terminal.
     */
    width?: number;

    /**
     * A value indicating the maximum width of the terminal.
     */
    maxWidth?: number;

    /**
     * General options parsed on the command line.
     */
    options?: CommandLineOptionMap;

    /**
     * Indicates that this command line represents a command container only. Help should be printed
     * if no command was found.
     */
    container?: boolean;

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

    /**
     * A callback executed prior to executing the command line.
     */
    preExec?: CommandLineExecCallback;

    /**
     * A callback that can be used to execute the command line if no command has already executed.
     */
    exec?: CommandLineExecCallback;

    /**
     * A callback executed after executing the command line.
     */
    postExec?: CommandLineExecCallback;
}

/**
 * Named command commands.
 */
export interface CommandLineCommandMap {
    [key: string]: CommandLineCommand;
}

export interface CommandLineAlias {
    command: string | CommandPath;
    args?: ReadonlyArray<string>;
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
     * This command is a shortcut for a set of command-line arguments.
     */
    aliasFor?: string | CommandPath | CommandLineAlias;

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
     * Subcommands with individual command line options.
     **/
    commands?: CommandLineCommandMap;

    /**
     * Indicates the command should not be printed when printing help text.
     * @deprecated Use `visiblity: "hidden"` instead.
     */
    hidden?: boolean;

    /**
     * Indicates when the command should be visible when printing help text.
     */
    visibility?: CommandLineVisibility | "inherit";

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

    /**
     * Indicates that this command represents a request for top-level help.
     *
     * NOTE: A help command may not have subcommands.
     */
    help?: boolean;

    /**
     * Indicates that this command represents a container only. Help should be printed for this
     * command and its subcommands when invoked.
     */
    container?: boolean;

    /**
     * A callback executed prior to executing the command line.
     */
    preExec?: CommandLineExecCallback;

    /**
     * A callback that can be used to execute the command.
     */
    exec?: CommandLineExecCallback;

    /**
     * A callback executed after executing the command line.
     */
    postExec?: CommandLineExecCallback;
}

export interface CommandLineOptionSets {
    [key: string]: CommandLineOptionSet;
}

export interface CommandLineOptionSet {
    setName?: string;

    /**
     * Indicates the option set should not be printed when printing help text.
     * @deprecated Use `visiblity: "hidden"` instead.
     */
    hidden?: boolean;

    /**
     * Indicates when the option set should be visible when printing help text.
     */
    visibility?: CommandLineVisibility | "inherit";

    merge?: boolean;
    include?: string | string[];
    options?: CommandLineOptionMap;
}

/**
 * Named command line options.
 */
export interface CommandLineOptionMap {
    [key: string]: CommandLineOption;
}

export interface CommandLineOptionBase<T, TDefault = T> {
    /**
     * The type for the option.
     */
    type?: "string" | "number" | "boolean";

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
     * @deprecated Use `visiblity: "hidden"` instead.
     */
    hidden?: boolean;

    /**
     * Indicates when the option should be visible when printing help text.
     */
    visibility?: CommandLineVisibility | "inherit";

    /**
     * A string to use in help text to describe the option.
     */
    description?: string;

    /**
     * Callback used to convert a supplied argument value.
     */
    convert?: T extends unknown ? CommandLineConvertCallback<T> : never,

    /**
     * Callback used to validate a supplied argument value.
     */
    validate?: T extends unknown ? CommandLineValidateCallback<T> : never;

    /**
     * Callback used to specify the error message to use for this option.
     */
    error?: CommandLineErrorCallback | CommandLineParseErrorDefinition | string;

    /**
     * Callback used to generate a default value for this option.
     */
    defaultValue?: TDefault extends unknown ? CommandLineDefaultValueCallback<TDefault> | TDefault : never;
}

/**
 * An unspecified command line option.
 */
export interface CommandLineUnspecifiedOption extends CommandLineOptionBase<string | number | boolean, string | string[] | number | number[] | boolean> {
    /**
     * The type for the option.
     */
    type?: undefined;

    /**
     * Indicates whether the option can be specified more than once. The results are provided as
     * an array.
     */
    multiple?: boolean | "no-comma" /*deprecated*/ | "comma-separated";

    /**
     * Maps an argument to a specific value.
     */
    map?: CommandLineValueMap<string | number>;

    /**
     * Specifies whether option value matching should be case-insensitive.
     */
    ignoreCase?: boolean;

    /**
     * Validates that the value is one of the supplied values.
     */
    in?: (string | number)[];

    /**
     * A string to use in help text for the argument of an option that expects a value.
     */
    param?: string;

    // boolean options:

    /**
     * Indicates that this option is a help option. Only one option may be declared as a help
     * option.
     */
    help?: boolean;

    /**
     * This option is a shortcut for a set of command-line arguments.
     */
    aliasFor?: string | [string, ...string[]];

    // string options:

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

/**
 * A boolean command line option.
 */
export interface CommandLineBooleanOption extends CommandLineOptionBase<boolean, boolean> {
    /**
     * The type for the option.
     */
    type: "boolean";

    /**
     * Indicates that this option is a help option. Only one option may be declared as a help
     * option.
     */
    help?: boolean;

    /**
     * This option is a shortcut for a set of command-line arguments.
     */
    aliasFor?: string | [string, ...string[]];
}

/**
 * A string command line option.
 */
export interface CommandLineStringOption extends CommandLineOptionBase<string, string | string[]> {
    /**
     * The type for the option.
     */
    type: "string";

    /**
     * Indicates whether the option can be specified more than once. The results are provided as
     * an array.
     */
    multiple?: boolean | "no-comma" /*deprecated*/ | "comma-separated";

    /**
     * Maps an argument to a specific value.
     */
    map?: CommandLineValueMap<string>;

    /**
     * Specifies whether option value matching should be case-insensitive.
     */
    ignoreCase?: boolean;

    /**
     * Validates that the value is one of the supplied values.
     */
    in?: string[];

    /**
     * A string to use in help text for the argument of an option that expects a value.
     */
    param?: string;

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

/**
 * A number command line option.
 */
export interface CommandLineNumberOption extends CommandLineOptionBase<number, number | number[]> {
    /**
     * The type for the option.
     */
    type: "number";

    /**
     * Indicates whether the option can be specified more than once. The results are provided as
     * an array.
     */
    multiple?: boolean | "no-comma" /*deprecated*/ | "comma-separated";

    /**
     * Maps an argument to a specific value.
     */
    map?: CommandLineValueMap<number>;

    /**
     * Specifies whether option value matching should be case-insensitive.
     */
    ignoreCase?: boolean;

    /**
     * Validates that the value is one of the supplied values.
     */
    in?: number[];

    /**
     * A string to use in help text for the argument of an option that expects a value.
     */
    param?: string;
}

export type CommandLineOption =
    | CommandLineBooleanOption
    | CommandLineStringOption
    | CommandLineNumberOption
    | CommandLineUnspecifiedOption;

export interface CommandLineValueMap<T> {
    [key: string]: T;
}

export interface CommandLineParseErrorDefinition {
    message: string;
    help?: boolean;
    status?: number;
}

export class CommandLineParseError extends Error {
    public help: boolean;
    public status: number;

    constructor(message?: string, help: boolean = false, status: number = -1) {
        super(message);
        this.help = help;
        this.status = status;
    }
}

Object.defineProperty(CommandLineParseError.prototype, "name", { writable: true, configurable: true, value: CommandLineParseError.name });

export type ParsedArgumentType = string | number | boolean | string[] | number[];

export interface ParsedCommandLine<T> {
    handled: boolean;
    options: T;
    commandName?: string;
    commandPath?: CommandPath;
    command?: CommandLineCommand;
    group?: string;
    help?: boolean | HelpDetails.Examples | HelpDetails.Advanced | HelpDetails.Full;
    error?: string;
    status?: number;
}

export enum HelpDetails {
    None =      0x0,
    Examples =  0x1,
    Advanced =  0x2,
    Full =      0x3,
}