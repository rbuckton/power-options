import { CommandLineOption, CommandLineOptionMap, CommandLineCommand, CommandLineParseError, CommandLineSettings, ParsedArgs, ParsedArgumentType } from "./options";
import { compareValues } from "./utils";
import { ReadonlyCollection, ReadonlySet } from "./readonly";
import { ParsedArgument } from "./parser";
import { Query, from } from "iterable-query";

// interface Map<T> { [key: string]: T; }

const shortNamePattern = /^[a-z0-9?!]$/i;

export class Option {
    public readonly key: string;
    public readonly command: Command | undefined;
    public readonly option: CommandLineOption;
    public readonly type: "boolean" | "number" | "string";
    public readonly longName: string | undefined;
    public readonly shortName: string | undefined;
    public readonly aliases: ReadonlyCollection<string>;
    public readonly position: number | undefined;
    public readonly required: boolean;
    public readonly help: boolean;
    public readonly single: boolean;
    public readonly multiple: boolean;
    public readonly passthru: boolean;
    public readonly rest: boolean;
    public readonly groups: ReadonlyCollection<string>;
    public readonly hidden: boolean;
    public readonly param: string | undefined;
    public readonly description: string | undefined;
    public readonly hasValidator: boolean;
    public readonly hasConverter: boolean;
    public readonly hasCustomError: boolean;
    public readonly hasDefaultValue: boolean;

    private readonly _sortKey: string;
    private readonly _validate: ((value: boolean | number | string, arg: string, parsedArgs: ParsedArgs) => CommandLineParseError) | undefined;
    private readonly _convert: ((value: string, arg: string) => number | string | CommandLineParseError) | undefined;
    private readonly _error: ((arg: string, error: CommandLineParseError) => CommandLineParseError) | undefined;
    private readonly _defaultValue: ((parsedArgs: ParsedArgs, group: string | undefined) => ParsedArgumentType | CommandLineParseError) | undefined;

    constructor(key: string, command: Command | undefined, commandLineOption: CommandLineOption) {
        if (typeof key !== "string" || !key) throw Errors.invalidKey(key);
        if (typeof commandLineOption !== "object" || !commandLineOption) throw Errors.invalidCommandLineOption(key);
        const type = inferType(commandLineOption);
        checkCommandLineOption(key, type, commandLineOption);
        const { longName, shortName, alias, position, required, help, single, multiple, passthru, rest, group, hidden, param, description, validate, convert, error, defaultValue } = commandLineOption;
        this.key = key;
        this.command = command;
        this.option = commandLineOption;
        this.type = type;
        this.longName = longName !== null ? normalizeName(longName || key) : shortName ? undefined : normalizeName(key);
        this.shortName = shortName ? shortName.trim() : undefined;
        this.aliases = Array.isArray(alias) ? alias.map(normalizeName) : alias ? [normalizeName(alias)] : [];
        this.position = position;
        this.required = required || false;
        this.help = help || false;
        this.single = single || false;
        this.multiple = multiple || rest || false;
        this.passthru = passthru || false;
        this.rest = rest || false;
        this.groups = Array.isArray(group) ? group.slice() : group ? [group] : [];
        this.hidden = hidden || false;
        this.param = param || (type !== "boolean" ? type : undefined);
        this.description = description;
        this.hasValidator = typeof validate === "function";
        this.hasConverter = typeof convert === "function";
        this.hasCustomError = typeof error === "function";
        this.hasDefaultValue = typeof defaultValue === "function";
        this._validate = validate;
        this._convert = convert;
        this._error = error;
        this._defaultValue = defaultValue;

        this._sortKey = "";
        if (this.shortName) this._sortKey += this.shortName;
        if (this.shortName && this.longName) this._sortKey += " ";
        if (this.longName) this._sortKey += this.longName;
    }

    public static compare(x: Option | undefined, y: Option | undefined) {
        if (x === y) return 0;
        if (x === undefined) return -1;
        if (y === undefined) return +1;
        return compareValues(x._sortKey, y._sortKey);
    }

    public compare(other: Option | undefined) {
        return Option.compare(this, other);
    }

    public validate(value: boolean | number | string, parameterName: string, parsedArgs: ParsedArgs): CommandLineParseError | undefined {
        if (!this._validate) return undefined;
        return this._validate.call(this.option, value, parameterName, parsedArgs);
    }

    public convert(value: string, arg: string): number | string | CommandLineParseError {
        if (!this._convert) throw Errors.noConversionDefined(this.key);
        return this._convert.call(this.option, value, arg);
    }

    public error(arg: string, error: CommandLineParseError): CommandLineParseError {
        if (!this._error) return error;
        return this._error.call(this.option, arg, error) || error;
    }

    public getDefaultValue(parsedArgs: ParsedArgs, group: string | undefined): ParsedArgumentType | CommandLineParseError | undefined {
        if (!this._defaultValue) return undefined;
        return this._defaultValue.call(this.option, parsedArgs, group);
    }
}

export abstract class Resolver {
    public readonly groups: ReadonlyCollection<string>;

    private readonly _keyMap = new Map<string | symbol, Option>();
    private readonly _shortNameMap = new Map<string, Option>();
    private readonly _longNameMap = new Map<string, Option>();
    private readonly _positionMap = new Map<number, Option[]>();
    private readonly _options: Option[] = [];
    private readonly _groupsSet = new Set<string>();
    private readonly _groups: string[] = [];
    private _passthru: Option | undefined;
    private _rest: Option | undefined;
    private _defaultGroup: string | undefined;
    private _parent: Resolver | undefined;

    constructor(options: CommandLineOptionMap | undefined, defaultGroup: string | undefined, parent?: Resolver) {
        this.groups = this._groups;
        this._parent = parent;
        this._defaultGroup = defaultGroup;
        if (options) {
            for (const key of Object.keys(options)) {
                const option = options[key];
                this.addOption(key, option);
            }
        }
    }

    public getPassthru(): Option | undefined {
        return this._passthru
            || (this._parent ? this._parent.getPassthru() : undefined);
    }

    public getRest(): Option | undefined {
        return this._rest
            || (this._parent ? this._parent.getRest() : undefined);
    }

    public getDefaultGroup(): string | undefined {
        return this._defaultGroup
            || (this._parent ? this._parent.getDefaultGroup() : undefined);
    }

    public fromShortName(shortName: string): Option | undefined {
        return this._shortNameMap.get(shortName)
            || (this._parent ? this._parent.fromShortName(shortName) : undefined);
    }

    public fromLongName(longName: string): Option | undefined {
        return this._longNameMap.get(normalizeName(longName))
            || (this._parent ? this._parent.fromLongName(longName) : undefined);
    }

    public fromPosition(position: number): ReadonlyCollection<Option> | undefined {
        return this._positionMap.get(position)
            || (this._parent ? this._parent.fromPosition(position) : undefined);
    }

    public has(key: string): boolean {
        return this._keyMap.has(key)
            || (this._parent ? this._parent.has(key) : false);
    }

    public get(key: string): Option | undefined {
        return this._keyMap.get(key)
            || (this._parent ? this._parent.get(key) : undefined);
    }

    public getShortName(key: string, includePrefix?: boolean) {
        const option = this.get(key);
        if (!option || !option.shortName) return undefined;
        return includePrefix ? "-" + option.shortName : option.shortName;
    }

    public getLongName(key: string, includePrefix?: boolean) {
        const option = this.get(key);
        if (!option || !option.longName) return undefined;
        return includePrefix ? "--" + option.longName : option.longName;
    }

    public getOwnOptions(group?: string): ReadonlyCollection<Option> {
        return this._getOptions(group, /*own*/ true).toArray();
    }

    public getOptions(group?: string): ReadonlyCollection<Option> {
        return this._getOptions(group, /*own*/ false).toArray();
    }

    public getDefaultOptions(group?: string): ReadonlyCollection<Option> {
        return this._getOptions(group, /*own*/ false)
            .where(option => option.hasDefaultValue)
            .toArray();
    }

    public getRequiredOptions(group?: string): ReadonlyCollection<Option> {
        return this._getOptions(group, /*own*/ false)
            .where(option => option.required)
            .toArray();
    }

    protected _getOptions(group: string | undefined, own: boolean) {
        let q = from(this._options);
        if (group === undefined) {
            q = q.where(option => option.groups.length === 0);
        }
        else if (group !== "*") {
            q = q.where(option => option.groups.length === 0 || option.groups.indexOf(group!) !== -1);
        }
        if (!own && this._parent) {
            q = q.union(this._parent.getOptions(group));
        }
        return q;
    }

    public addOption(key: string, commandLineOption: CommandLineOption) {
        const option = new Option(key, this._getCommand(), commandLineOption);
        this._addKey(key, option);
        if (option.passthru) this._addPassthru(option);
        if (option.rest) this._addRest(option);
        if (option.longName) this._addLongName(option.longName, option, "long name");
        if (option.shortName) this._addShortName(option.shortName, option, "short name");
        if (option.position !== undefined) this._addPosition(option.position, option);
        this._addAliases(option);
        this._addGroups(option);
        this._options.push(option);
        return option;
    }

    protected abstract _getCommand(): Command | undefined;

    private _addPassthru(option: Option) {
        if (this._passthru) throw Errors.duplicatePassthru(option.key, this._passthru.key);
        this._passthru = option;
    }

    private _addRest(option: Option) {
        if (this._rest) throw Errors.duplicateRest(option.key, this._rest.key);
        this._rest = option;
    }

    private _addKey(key: string, option: Option) {
        const existing = this._keyMap.get(key);
        if (existing) throw Errors.duplicateKey(key);
        this._keyMap.set(key, option);
    }

    private _addLongName(longName: string, option: Option, kind: string) {
        const existing = this._longNameMap.get(longName);
        if (existing) {
            throw new Error(`Duplicate ${kind} '${longName}' for option '${option.key}' conflicts with previous definition '${existing.key}'.`);
        }

        this._longNameMap.set(longName, option);
    }

    private _addShortName(shortName: string, option: Option, kind: string) {
        const existing = this._shortNameMap.get(shortName);
        if (existing) {
            throw new Error(`Duplicate ${kind} '${shortName}' for option '${option.key}' conflicts with previous definition '${existing.key}'.`);
        }

        this._shortNameMap.set(shortName, option);
    }

    private _addAliases(option: Option) {
        for (const alias of option.aliases) {
            if (alias.length === 1)
                this._addShortName(alias, option, "alias");
            else
                this._addLongName(alias, option, "alias");
        }
    }

    private _getOptionsForPosition(position: number) {
        let options = this._positionMap.get(position);
        if (options) return options;
        options = [];
        this._positionMap.set(position, options);
        return options;
    }

    private _addPosition(position: number, option: Option) {
        const options = this._getOptionsForPosition(position);
        if (option.groups.length === 0) {
            if (options.length > 0) throw Errors.duplicatePosition(option.key, options[0].key);
        }
        else {
            for (const existingOption of options) {
                if (existingOption.groups.length > 0) {
                    const intersection = from(existingOption.groups).intersect(option.groups).toArray();
                    if (intersection) throw Errors.duplicatePositionWithGroups(option.key, existingOption.key, intersection);
                }
                else {
                    throw Errors.duplicatePosition(option.key, existingOption.key);
                }
            }
        }

        options.push(option);
    }

    private _addGroups(option: Option) {
        for (const group of option.groups) {
            if (!this._groupsSet.has(group)) {
                this._groupsSet.add(group);
                this._groups.push(group);
            }
        }
    }
}

export class Command extends Resolver {
    public readonly key: string;
    public readonly command: CommandLineCommand;
    public readonly commandName: string;
    public readonly aliases: ReadonlyCollection<string>;
    public readonly hidden: boolean;
    public readonly usages: ReadonlyCollection<string>;
    public readonly examples: ReadonlyCollection<string>;
    public readonly synopsis: string;
    public readonly description: string;

    constructor(parent: CommandResolver, key: string, commandLineCommand: CommandLineCommand) {
        if (typeof key !== "string" || !key) throw Errors.invalidKey(key);
        if (typeof commandLineCommand !== "object" || commandLineCommand === null) throw Errors.invalidCommand(key);
        const { commandName, alias, options, hidden, usage, example, synopsis, description, defaultGroup } = commandLineCommand;
        super(options, defaultGroup, parent);
        this.key = key;
        this.command = commandLineCommand;
        this.commandName = normalizeName(commandName || key);
        this.aliases = Array.isArray(alias) ? alias.map(normalizeName) : alias ? [normalizeName(alias)] : [];
        this.hidden = hidden || false;
        this.usages = Array.isArray(usage) ? usage.slice() : usage ? [usage] : [];
        this.examples = Array.isArray(example) ? example.slice() : example ? [example] : [];
        this.synopsis = synopsis || "";
        this.description = description || "";
    }

    public static compare(x: Command | undefined, y: Command | undefined) {
        if (x === y) return 0;
        if (x === undefined) return -1;
        if (y === undefined) return +1;
        return compareValues(x.commandName, y.commandName)
            || compareValues(x.key, y.key);
    }

    public compare(other: Command | undefined) {
        return Command.compare(this, other);
    }

    protected _getCommand() {
        return this;
    }
}

export class CommandResolver extends Resolver {
    private readonly _commandMap = new Map<string, Command>();
    private _hasCommands: boolean;
    private _hasHelp: boolean;

    constructor(settings: CommandLineSettings) {
        super(settings.options, settings.defaultGroup);
        this._hasCommands = false;

        // Ensure a help option.
        if (!this._hasHelp) {
            this.addOption("help", { type: "boolean", shortName: "h", longName: "help", alias: ["?"], help: true, description: "Prints this message." });
            this._hasHelp = true;
        }

        if (settings.commands) {
            for (const key of Object.keys(settings.commands)) {
                const command = settings.commands[key];
                if (command) {
                    this.addCommand(key, settings.commands[key]);
                }
            }
        }
    }

    public get hasCommands() {
        return this._hasCommands;
    }

    public fromCommandName(commandName: string) {
        return this._commandMap.get(normalizeName(commandName));
    }

    public getCommands(): ReadonlyCollection<Command> {
        return Array.from(this._commandMap.values());
    }

    public addOption(key: string, commandLineOption: CommandLineOption) {
        const option = super.addOption(key, commandLineOption);
        if (commandLineOption.help) {
            this._hasHelp = true;
        }
        return option;
    }

    public addCommand(key: string, commandLineCommand: CommandLineCommand) {
        const command = new Command(this, key, commandLineCommand);
        if (command.commandName) this._addCommandName(command.commandName, command);
        this._hasCommands = true;
    }

    protected _getCommand(): Command | undefined {
        return undefined;
    }

    private _addCommandName(commandName: string, command: Command) {
        const existing = this._commandMap.get(commandName);
        if (existing) throw Errors.duplicateCommand(commandName, command.key, existing.key);
        this._commandMap.set(commandName, command);
    }
}

export function normalizeName(name: string) {
    return name && name
        .trim()
        .toLocaleLowerCase()
        .replace(/_/g, "-");
}

export function normalizeOption(key: string, option: CommandLineOption) {
    option.longName = normalizeName(option.longName || key);
}

function inferType(commandLineOption: CommandLineOption): "boolean" | "number" | "string" {
    const type = commandLineOption.type;
    if (!type) {
        if (commandLineOption.passthru
            || commandLineOption.rest
            || commandLineOption.multiple
            || commandLineOption.required
            || typeof commandLineOption.position === "number") {
            return "string";
        }
        else {
            return "boolean";
        }
    }
    return type;
}

function checkCommandLineOption(key: string, type: "boolean" | "number" | "string", commandLineOption: CommandLineOption) {
    const { longName, shortName, alias, single, multiple, passthru, rest, convert, help, } = commandLineOption;
    switch (type) {
        case "boolean":
            if (multiple) throw Errors.booleanOptionCannotBeMultiple(key);
            if (passthru) throw Errors.booleanOptionCannotBePassthru(key);
            if (rest) throw Errors.booleanOptionCannotBeRest(key);
            if (convert) throw Errors.booleanOptionCannotHaveConverter(key);
            break;

        case "number":
        case "string":
            if (help) throw Errors.stringOrNumberOptionCannotBeHelp(key, type);
            break;
    }

    if (single) {
        if (multiple) throw Errors.optionCannotBeBothSingleAndMultiple(key);
        if (rest) throw Errors.restOptionCannotBeSingle(key);
    }

    if (help) {
        if (multiple) throw Errors.helpOptionCannotBeMultiple(key);
        if (rest) throw Errors.helpOptionCannotBeRest(key);
        if (passthru) throw Errors.helpOptionCannotBePassthru(key);
    }

    if (longName) {
        if (/^$|\s/.test(longName.trim())) throw Errors.invalidLongName(key);
    }

    if (shortName) {
        if (shortName.trim().length !== 1) throw Errors.invalidShortName(key);
    }

    if (Array.isArray(alias)) {
        for (const aliasName of alias) {
            if (/^$|\s/.test(aliasName.trim())) throw Errors.invalidAlias(key);
        }
    }
    else if (alias) {
        if (/^$|\s/.test(alias.trim())) throw Errors.invalidAlias(key);
    }
}

namespace Errors {
    export function invalidKey(key: string) {
        return new TypeError(`Invalid key: '${key}'.`);
    }
    export function invalidCommandLineOption(key: string) {
        return new TypeError(`Invalid CommandLineOption for key: '${key}'`);
    }
    export function invalidCommand(key: string) {
        return new TypeError(`Invalid CommandLineCommand for key: '${key}'`);
    }
    export function invalidShortName(key: string) {
        return new Error(`Option '${key}' has an invalid short name. Short names may only be a single character.`);
    }
    export function invalidLongName(key: string) {
        return new Error(`Option '${key}' has an invalid long name. Long names must be one or more characters with no whitespace.`);
    }
    export function invalidAlias(key: string) {
        return new Error(`Option '${key}' has an invalid alias. Aliases must be one or more characters with no whitespace.`);
    }
    export function optionCannotBeBothSingleAndMultiple(key: string) {
        return new Error(`Option '${key}' cannot be both single and multiple.`);
    }
    export function restOptionCannotBeSingle(key: string) {
        return new Error(`Option '${key}' is declared as a rest option and cannot be single.`);
    }
    export function helpOptionCannotBeMultiple(key: string) {
        return new Error(`Option '${key}' is declared as a help option and cannot be multiple.`);
    }
    export function helpOptionCannotBeRest(key: string) {
        return new Error(`Option '${key}' is declared as a help option and cannot be declared as a rest option.`);
    }
    export function helpOptionCannotBePassthru(key: string) {
        return new Error(`Option '${key}' is declared as a help option and cannot be declared as a passthru option.`);
    }
    export function booleanOptionCannotBeMultiple(key: string) {
        return new Error(`Option '${key}' of type 'boolean' cannot be multiple.`);
    }
    export function booleanOptionCannotBePassthru(key: string) {
        return new Error(`Option '${key}' of type 'boolean' cannot be passthru.`);
    }
    export function booleanOptionCannotBeRest(key: string) {
        return new Error(`Option '${key}' of type 'boolean' cannot be rest.`);
    }
    export function booleanOptionCannotHaveConverter(key: string) {
        return new Error(`Option '${key}' of type 'boolean' cannot have a convert method.`);
    }
    export function stringOrNumberOptionCannotBeHelp(key: string, type: string) {
        return new Error(`Option '${key}' of type '${type}' cannot be help.`);
    }
    export function noConversionDefined(key: string) {
        return new Error(`Option '${key}' does not have a converter defined.`);
    }
    export function duplicateKey(key: string) {
        return new Error(`Duplicate key: '${key}'`);
    }
    export function duplicatePassthru(key: string, previousKey: string) {
        return new Error(`Duplicate passthru option '${key}' conflicts with previous definition '${previousKey}'`);
    }
    export function duplicateRest(key: string, previousKey: string) {
        return new Error(`Duplicate rest option '${key}' conflicts with previous definition '${previousKey}'`);
    }
    export function duplicateCommand(commandName: string, key: string, previousKey: string) {
        return new Error(`Duplicate command name '${commandName}' for command '${key}' conflicts with previous definition '${previousKey}'.`);
    }
    export function duplicatePosition(key: string, previousKey: string) {
        return new Error(`Option '${key}' specifies the same position as option '${previousKey}'.`);
    }
    export function duplicatePositionWithGroups(key: string, previousKey: string, groups: string[]) {
        throw new Error(`Option '${key}' specifies the same position as option '${previousKey}' in ${formatList(groups, "group", "groups")}.`);
    }
    function formatList(list: string[], singular: string, plural: string) {
        return `${list.length > 1 ? plural : singular} ${list.map(s => `"${s}"`).join(", ")}`;
    }
}