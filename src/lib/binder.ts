import { CommandLineParseError } from "./types";
import { Command, Resolver, Option, RestOption } from "./resolver";
import { getParameterName, ParsedArgument, parse, ParsedArgumentValue } from "./parser";
import { toCommandLineParseError } from "./utils";

const booleanPattern = /^(?:(-?1|t(rue)?|y(es)?)|(0|f(alse)?|n(o)?))$/i;

type Ref<T> = { value: T };

export interface BindResult {
    boundCommand: BoundCommand | undefined;
    boundArguments: BoundArgument[];
    groups: string[] | undefined;
    resolver: Resolver;
}

export interface BoundCommand {
    parent?: BoundCommand;
    parsed?: ParsedArgument;
    command?: Command;
    error?: CommandLineParseError;
}

export interface BoundArgument {
    parsed?: ParsedArgument;
    option?: Option;
    argument?: BoundArgumentValue;
    error?: CommandLineParseError;
}

export interface BoundArgumentValue {
    value?: string | number | boolean;
    values?: string[] | number[];
}

interface PossibleBinding {
    boundArgument: BoundArgument;
    possibleGroups: string[] | undefined;
}

export function bind(parsedArguments: ParsedArgument[], resolver: Resolver): BindResult {
    const usedPositions = new Set<number>();
    const boundArguments: BoundArgument[] = [];
    let boundCommand: BoundCommand | undefined;
    let groups: string[] | undefined;
    let restOption: RestOption | undefined;
    parsedArguments = bindNamedArguments(parsedArguments, resolver.hasCommands);
    parsedArguments = bindPositionalArguments(parsedArguments);
    bindFreeArguments(parsedArguments);

    return { boundArguments, boundCommand, groups, resolver };

    function bindNamedArguments(parsedArguments: ParsedArgument[], bindCommands: boolean) {
        let unboundArguments: ParsedArgument[] = [];
        let parsed: ParsedArgument | undefined;
        while (parsed = parsedArguments.shift()) {
            const parameter = parsed.parameter;
            if (parameter) {
                let property: Option | undefined;
                if (parameter.passthru) {
                    property = resolver.getPassthruOption();
                }
                else if (parameter.shortName) {
                    property = resolver.fromShortName(parameter.shortName);
                }
                else if (parameter.longName) {
                    property = resolver.fromLongName(parameter.longName);
                }

                const boundArgument = bindArgument(parsed, property, parsedArguments, usedPositions);
                groups = applyGroupRestrictions(boundArgument, groups, /*copyOnModify*/ false);
                if (boundArgument.option && boundArgument.option.aliasFor) {
                    const parseResult = parse(boundArgument.option.aliasFor.slice());
                    unboundArguments = unboundArguments.concat(bindNamedArguments(parseResult.parsedArguments, /*allowCommands*/ false));
                }
                else {
                    boundArguments.push(boundArgument);
                }
            }
            else if (bindCommands) {
                const command = resolver.getCommand(parsed.text);
                if (!command) {
                    boundCommand = {
                        parent: boundCommand,
                        parsed,
                        error: new CommandLineParseError(`Command '${parsed.text}' was unrecognized.`, /*help*/ true)
                    };
                }
                else if (command.aliasFor) {
                    const parseResult = parse(command.aliasFor.getUnparsedArguments());
                    parsedArguments = parseResult.parsedArguments.concat(parsedArguments);
                }
                else {
                    resolver = command;
                    bindCommands = resolver.hasCommands;
                    boundCommand = { parent: boundCommand, parsed, command };
                }
            }
            else {
                unboundArguments.push(parsed);
            }
        }
        return unboundArguments;
    }

    function bindPositionalArguments(parsedArguments: ParsedArgument[]) {
        const freeArguments: ParsedArgument[] = [];
        let position = 0;
        let parsed: ParsedArgument | undefined;
        while (parsed = parsedArguments.shift()) {
            // Skip positions for bound arguments.
            while (usedPositions.has(position)) position++;

            // If the rest option is positional, consume the remaining unbound arguments.
            if (restOption && restOption.position !== undefined && restOption.position <= position) {
                freeArguments.push(parsed, ...parsedArguments);
                break;
            }

            const options = resolver.fromPosition(position);
            if (!options) {
                freeArguments.push(parsed);
            }
            else if (options.length === 1) {
                const boundArgument = bindArgument(parsed, options[0], /*parsedArguments*/ undefined, usedPositions);
                groups = applyGroupRestrictions(boundArgument, groups, /*copyOnModify*/ false);
                if (boundArgument.option && boundArgument.option.aliasFor) {
                    const parseResult = parse(boundArgument.option.aliasFor.slice());
                    parsedArguments = bindNamedArguments(parseResult.parsedArguments, /*bindCommands*/ false).concat(parsedArguments);
                }
                else {
                    boundArguments.push(boundArgument);
                }
            }
            else {
                // Attempt each possible binding.
                const possibleBindings: PossibleBinding[] = [];
                for (const option of options) {
                    const boundArgument = bindArgument(parsed, option, /*parsedArguments*/ undefined, usedPositions);
                    const possibleGroups = applyGroupRestrictions(boundArgument, groups, /*copyOnModify*/ true);
                    if (!boundArgument.error) {
                        possibleBindings.push({ boundArgument, possibleGroups });
                    }
                }

                // If there was only one successful binding, use it.
                if (possibleBindings.length === 1) {
                    const possibleBinding = possibleBindings[0];
                    groups = possibleBinding.possibleGroups;
                    boundArguments.push(possibleBinding.boundArgument);
                }
                else {
                    boundArguments.push({
                        error: new CommandLineParseError(`Ambiguous parameter '${parsed.text}' at position ${position}. Try specifying the command line option explicitly.`, /*help*/ true)
                    });
                }
            }
            position++;
        }
        return freeArguments;
    }

    function bindFreeArguments(parsedArguments: ParsedArgument[]) {
        let parsed: ParsedArgument | undefined;
        while (parsed = parsedArguments.shift()) {
            if (!restOption) {
                boundArguments.push({
                    parsed,
                    option: undefined,
                    argument: undefined,
                    error: new CommandLineParseError(`Option '${parsed.text}' was unrecognized.`, /*help*/ true)
                });
            }
            else {
                boundArguments.push(bindArgument(parsed, restOption, /*parsedArguments*/ undefined, usedPositions));
            }
        }
    }
}

function bindArgument(parsed: ParsedArgument, option: Option | undefined, args: ParsedArgument[] | undefined, usedPositions: Set<number>): BoundArgument {
    let argument: BoundArgumentValue | undefined;
    let error: CommandLineParseError | undefined;
    try {
        if (!option) {
            throw new CommandLineParseError(`Option '${getParameterName(parsed)}' was unrecognized.`, /*help*/ true);
        }
        else {
            const { position, type } = option;

            // If the option can be positional, mark that this position has been used.
            if (position !== undefined) {
                usedPositions.add(position);
            }

            // Parse the argument value (if provided or needed).
            switch (type) {
                case "boolean":
                    argument = bindBooleanOption(option, parsed);
                    break;

                case "number":
                    argument = bindNumberOption(option, parsed, args);
                    break;

                case "string":
                    argument = bindStringOption(option, parsed, args);
                    break;
            }

            if (argument === undefined) {
                throw new CommandLineParseError(`Option '${getParameterName(parsed, option)}' expects a value.`, /*help*/ true);
            }
        }
    }
    catch (e) {
        error = toCommandLineParseError(e);
    }
    return { parsed, option, argument, error };
}

function bindBooleanOption(option: Option, arg: ParsedArgument): BoundArgumentValue {
    let value = true;
    const argument = arg.argument;
    if (argument && argument.value) {
        value = convertBoolean(option, arg, argument.value);
    }
    const parameter = arg.parameter;
    if (parameter && parameter.no) {
        value = !value;
    }

    return { value };
}

function convertBoolean(option: Option, parsed: ParsedArgument, item: string): boolean {
    if (option.hasConverter) {
        const converted = option.convert(item, getParameterName(parsed, option));
        if (typeof converted === "boolean") {
            return converted;
        }
        else if (typeof converted === "string") {
            item = converted;
        }
        else {
            throw new CommandLineParseError(`Option '${getParameterName(parsed)}' expects a boolean.`, /*help*/ true);
        }
    }

    const match = booleanPattern.exec(item);
    if (match) {
        return !!match[1];
    }

    throw new CommandLineParseError(`Option '${getParameterName(parsed)}' expects a boolean.`, /*help*/ true);
}

function bindNumberOption(option: Option, arg: ParsedArgument, args: ParsedArgument[] | undefined): BoundArgumentValue | undefined {
    const argument = arg.argument || readNextArgumentValue(args);
    if (argument) {
        if (argument.values !== undefined && (option.multiple === "comma-separated" || (arg.parameter && arg.parameter.passthru))) {
            const values = convertNumbers(option, arg, argument.values);
            switch (values.length) {
                case 0: return undefined;
                case 1: return { value: values[0] };
                default: return { value: argument.value, values };
            }
        }
        else if (argument.value !== undefined) {
            const value = convertNumber(option, arg, argument.value);
            return { value };
        }
    }
    return undefined;
}

function convertNumbers(option: Option, parsed: ParsedArgument, items: string[]): number[] {
    const values: number[] = [];
    for (const item of items) {
        values.push(convertNumber(option, parsed, item));
    }
    return values;
}

function convertNumber(option: Option, parsed: ParsedArgument, item: string): number {
    if (option.hasConverter) {
        const converted = option.convert(item, getParameterName(parsed, option));
        if (typeof converted === "number") {
            return converted;
        }
        else if (typeof converted === "string") {
            item = converted;
        }
        else {
            throw new CommandLineParseError(`Option '${getParameterName(parsed)}' expects a number.`, /*help*/ true);
        }
    }

    const num = parseInt(item);
    if (isNaN(num) || !isFinite(num)) {
        throw new CommandLineParseError(`Option '${getParameterName(parsed)}' expects a number.`, /*help*/ true);
    }

    return num;
}

function bindStringOption(option: Option, arg: ParsedArgument, args: ParsedArgument[] | undefined): BoundArgumentValue | undefined {
    const argument = arg.argument || readNextArgumentValue(args);
    if (argument === undefined) return undefined;
    if (argument.values !== undefined && (option.multiple === "comma-separated" || (arg.parameter && arg.parameter.passthru))) {
        const values = convertStrings(option, arg, argument.values);
        switch (values.length) {
            case 0: return undefined;
            case 1: return { value: values[0] };
            default: return { value: argument.value, values };
        }
    }
    else if (argument.value !== undefined) {
        const value = convertString(option, arg, argument.value);
        return { value };
    }
}

function convertStrings(option: Option, parsed: ParsedArgument, items: string[]): string[] {
    const values: string[] = [];
    for (const item of items) {
        values.push(convertString(option, parsed, item));
    }
    return values;
}

function convertString(option: Option, parsed: ParsedArgument, item: string): string {
    if (option.hasConverter) {
        const parameterName = getParameterName(parsed, option);
        const converted = option.convert(item, parameterName);
        return String(converted);
    }

    return item;
}

function readNextArgumentValue(args: ParsedArgument[] | undefined) {
    if (args && args.length > 0 && args[0].parameter === undefined) {
        return args.shift()!.argument;
    }
    return undefined;
}

function applyGroupRestrictions(arg: BoundArgument, groups: string[] | undefined, copyOnModify: boolean) {
    if (!arg.option || arg.error) {
        return groups;
    }

    const option = arg.option;

    // If the option belongs to a group, filter down available groups.
    if (option.groups.length > 0) {
        if (!groups) {
            groups = option.groups.slice();
        }
        else {
            let modifiedGroups = groups;
            for (let i = modifiedGroups.length - 1; i >= 0; i--) {
                if (option.groups.indexOf(modifiedGroups[i]) === -1) {
                    if (copyOnModify && modifiedGroups === groups) {
                        modifiedGroups = groups.slice();
                    }

                    modifiedGroups.splice(i, 1);
                }
            }

            groups = modifiedGroups;
            if (groups.length === 0) {
                arg.error = new CommandLineParseError(`Option '${getParameterName(arg.parsed)}' conflicts with other options.`, /*help*/ true);
            }
        }
    }

    return groups;
}