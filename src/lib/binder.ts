import { CommandLineOption, CommandLineCommand, CommandLineParseError, ParsedArgumentType } from "./options";
import { CommandResolver, Command, Resolver, Option } from "./resolver";
import { getParameterName, ParsedArgument } from "./parser";

const truePattern = /^(1|t(rue)?|y(es)?)$/i;

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
                        error: { error: `Command '${parsed.text}' was unrecognized.` }
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
                    error: {
                        error: `Ambiguous parameter '${parsed.text}' at position ${position}. Try specifying the command line option explicitly.`,
                        help: true,
                        status: -1
                    }
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
                error: { error: `Option '${parsed.text}' was unrecognized.`, help: true, status: -1 }
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
    if (!option) {
        error = { error: `Option '${getParameterName(parsed)}' was unrecognized.`, help: true, status: -1 };
    }
    else {
        // If the option can be positional, mark that this position has been used.
        if (option.position !== undefined) {
            usedPositions.add(option.position);
        }

        // Parse the argument value (if provided or needed).
        switch (option.type) {
            case "boolean":
                argument = bindBooleanOption(parsed);
                break;

            case "number":
                const result = bindNumberOption(option, parsed, args);
                if (isCommandLineParseError(result)) {
                    error = result;
                }
                else {
                    argument = result;
                }
                break;

            case "string":
                argument = bindStringOption(option, parsed, args);
                break;
        }

        if (!argument && !error) {
            error = { error: `Option '${getParameterName(parsed)}' expects a value.`, help: true, status: -1 };
        }
    }

    return { parsed, option, argument, error };
}

function bindBooleanOption(arg: ParsedArgument): BoundArgumentValue {
    const boolean = arg.argument === undefined || arg.argument.value === undefined || truePattern.test(arg.argument.value);
    const value = arg.parameter && arg.parameter.no ? !boolean : boolean;
    return { value };
}

function bindNumberOption(option: Option, arg: ParsedArgument, args: ParsedArgument[] | undefined): BoundArgumentValue | CommandLineParseError | undefined {
    const argument = arg.argument || readNextArgumentValue(args);
    if (argument) {
        if (argument.values !== undefined) {
            const values = convertNumbers(option, arg, argument.values);
            return isCommandLineParseError(values) ? values : values && values.length === 1 ? { value: values[0] } : { values };
        }
        else if (argument.value !== undefined) {
            const value = convertNumber(option, arg, argument.value);
            return isCommandLineParseError(value) ? value : { value };
        }
    }
    return undefined;
}

function convertNumbers(option: Option, parsed: ParsedArgument, items: string[]): number[] | CommandLineParseError | undefined {
    const values: number[] = [];
    for (const item of items) {
        const num = convertNumber(option, parsed, item);
        if (typeof num === "number") {
            values.push(num);
        }
        else {
            return num;
        }
    }
    return values;
}

function convertNumber(option: Option, parsed: ParsedArgument, item: string): number | CommandLineParseError | undefined {
    if (option.hasConverter) {
        const converted = option.convert(item, parsed.parameter!.parameterName!);
        if (typeof converted === "number" || typeof converted === "object") {
            return converted;
        }
        if (typeof converted === "string") {
            item = converted;
        }
    }

    const num = parseInt(item);
    if (isNaN(num) || !isFinite(num)) {
        return undefined;
    }

    return num;
}

function bindStringOption(option: Option, arg: ParsedArgument, args: ParsedArgument[] | undefined): BoundArgumentValue | CommandLineParseError | undefined {
    const argument = arg.argument || readNextArgumentValue(args);
    if (!argument) return undefined;
    if (argument.values !== undefined) {
        const values = convertStrings(option, arg, argument.values);
        return isCommandLineParseError(values) ? values : values.length === 1 ? { value: values[0] } : { value: argument.value, values };
    }
    else if (argument.value !== undefined) {
        const value = convertString(option, arg, argument.value);
        return isCommandLineParseError(value) ? value : { value };
    }
}

function convertStrings(option: Option, parsed: ParsedArgument, items: string[]): string[] | CommandLineParseError {
    const values: string[] = [];
    for (const item of items) {
        const text = convertString(option, parsed, item);
        if (typeof text === "string") {
            values.push(text);
        }
        else {
            return text;
        }
    }
    return values;
}

function convertString(option: Option, parsed: ParsedArgument, item: string): string | CommandLineParseError {
    if (option.hasConverter) {
        const converted = option.convert(item, parsed.parameter!.parameterName!);
        if (typeof converted === "string" || typeof converted === "object") {
            return converted;
        }
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
                arg.error = {
                    error: `Option '${getParameterName(arg.parsed)}' conflicts with other options.`,
                    help: true,
                    status: -1
                };
            }
        }
    }

    return groups;
}

export function isCommandLineParseError(value: any): value is CommandLineParseError {
    return value !== null
        && typeof value === "object"
        && typeof value.error === "string";
}