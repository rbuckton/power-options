import { CommandLineOption, CommandLineCommand, CommandLineParseError, CommandLineParseErrorDefinition, ParsedArgumentType } from "./types";
import { CommandResolver, Command, Resolver, Option } from "./resolver";
import { getParameterName, ParsedArgument } from "./parser";
import { toCommandLineParseError } from "./utils";

const booleanPattern = /^(?:(-?1|t(rue)?|y(es)?)|(0|f(alse)?|n(o)?))$/i;

export interface BindResult {
    boundCommand: BoundCommand | undefined;
    boundArguments: BoundArgument[];
    groups: string[] | undefined;
    resolver: Resolver;
}

export interface BoundCommand {
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

export function bind(parsedArguments: ParsedArgument[], commandLineResolver: CommandResolver): BindResult {
    const boundArguments: BoundArgument[] = [];
    const unboundArguments: ParsedArgument[] = [];
    const freeArguments: ParsedArgument[] = [];
    const usedPositions = new Set<number>();
    let groups: string[] | undefined;
    let command: Command | undefined;
    let resolver: Resolver = commandLineResolver;
    let boundCommand: BoundCommand | undefined;
    let parsed: ParsedArgument | undefined;

    // Bind command
    if (commandLineResolver.hasCommands) {
        // Bind explicit arguments without a command
        while (parsed = parsedArguments.shift()) {
            const parameter = parsed.parameter;
            if (parameter) {
                let property: Option | undefined;
                if (parameter.passthru) {
                    property = resolver.getPassthru();
                }
                else if (parameter.shortName) {
                    property = resolver.fromShortName(parameter.shortName);
                }
                else if (parameter.longName) {
                    property = resolver.fromLongName(parameter.longName);
                }

                const boundArgument = bindArgument(parsed, property, parsedArguments, usedPositions);
                groups = applyGroupRestrictions(boundArgument, groups, /*copyOnModify*/ false);
                boundArguments.push(boundArgument);
            }
            else {
                parsedArguments.unshift(parsed);
                break;
            }
        }

        for (let i = 0; i < parsedArguments.length; i++) {
            const parsed = parsedArguments[i];
            if (!parsed.parameter) {
                parsedArguments.splice(i, 1);
                command = commandLineResolver.fromCommandName(parsed.text);
                if (!command) {
                    boundCommand = {
                        parsed,
                        error: new CommandLineParseError(`Command '${parsed.text}' was unrecognized.`)
                    };
                }
                else {
                    resolver = command;
                    boundCommand = { parsed, command };
                }
                break;
            }
        }
    }

    // Bind explicit arguments
    while (parsed = parsedArguments.shift()) {
        const parameter = parsed.parameter;
        if (parameter) {
            let property: Option | undefined;
            if (parameter.passthru) {
                property = resolver.getPassthru();
            }
            else if (parameter.shortName) {
                property = resolver.fromShortName(parameter.shortName);
            }
            else if (parameter.longName) {
                property = resolver.fromLongName(parameter.longName);
            }

            const boundArgument = bindArgument(parsed, property, parsedArguments, usedPositions);
            groups = applyGroupRestrictions(boundArgument, groups, /*copyOnModify*/ false);
            boundArguments.push(boundArgument);
        }
        else {
            unboundArguments.push(parsed);
        }
    }

    // Bind positional arguments
    const restOption = resolver.getRest();
    let position = 0;
    while (parsed = unboundArguments.shift()) {
        // Skip positions for bound arguments.
        while (usedPositions.has(position)) position++;

        // If the rest option is positional, consume the remaining unbound arguments.
        if (restOption && restOption.position <= position) {
            freeArguments.push(parsed, ...unboundArguments);
            break;
        }

        const options = resolver.fromPosition(position);
        if (!options) {
            freeArguments.push(parsed);
        }
        else if (options.length === 1) {
            const boundArgument = bindArgument(parsed, options[0], /*args*/ undefined, usedPositions);
            groups = applyGroupRestrictions(boundArgument, groups, /*copyOnModify*/ false);
            boundArguments.push(boundArgument);
        }
        else {
            // Attempt each possible binding.
            const possibleBindings: PossibleBinding[] = [];
            for (const option of options) {
                const boundArgument = bindArgument(parsed, option, /*args*/ undefined, usedPositions);
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

    // Bind remaining free arguments
    while (parsed = freeArguments.shift()) {
        if (!restOption) {
            boundArguments.push({
                parsed,
                option: undefined,
                argument: undefined,
                error: new CommandLineParseError(`Option '${parsed.text}' was unrecognized.`, /*help*/ true)
            });
        }
        else {
            boundArguments.push({
                parsed,
                option: restOption,
                argument: parsed.argument,
                error: undefined
            });
        }
    }

    return { boundCommand, boundArguments, groups, resolver };
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
        if (argument.values !== undefined) {
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
    if (argument.values !== undefined) {
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