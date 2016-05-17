import { CommandLineOption, CommandLineParseError, ParsedArgumentType } from "./options";
import { OptionResolver, CommandLineOptionProperty } from "./resolver";
import { ParsedArgument } from "./parser";

const truePattern = /^(1|t(rue)?|y(es)?)$/i;

interface Map<T> { [key: string]: T; }

export interface BindResult {
    boundArguments: BoundArgument[];
    groups: string[];
}

export interface BoundArgument {
    parsed?: ParsedArgument;
    key?: string;
    option?: CommandLineOption;
    argument?: BoundArgumentValue;
    error?: CommandLineParseError;
}

export interface BoundArgumentValue {
    value?: string | number | boolean;
    values?: string[] | number[];
}

interface PossibleBinding {
    boundArgument: BoundArgument;
    possibleGroups: string[];
}

export function bind(parsedArguments: ParsedArgument[], resolver: OptionResolver): BindResult {
    const boundArguments: BoundArgument[] = [];
    const unboundArguments: ParsedArgument[] = [];
    const freeArguments: ParsedArgument[] = [];
    const usedPositions: Map<boolean> = Object.create(null);
    let groups: string[];

    // Bind explicit arguments
    const passthruOption = resolver.passthru;
    while (parsedArguments.length) {
        const arg = parsedArguments.shift();
        if (arg.parameter) {
            let property: CommandLineOptionProperty;
            if (arg.parameter.passthru) {
                property = passthruOption;
            }
            else if (arg.parameter.shortName) {
                property = resolver.fromShortName(arg.parameter.shortName);
            }
            else if (arg.parameter.longName) {
                property = resolver.fromLongName(arg.parameter.longName);
            }

            const boundArgument = bindArgument(arg, property, parsedArguments, usedPositions);
            groups = applyGroupRestrictions(boundArgument, groups, /*copyOnModify*/ false);
            boundArguments.push(boundArgument);
        }
        else {
            unboundArguments.push(arg);
        }
    }

    // Bind positional arguments
    const restOption = resolver.rest;
    let position = 0;
    let disallowCommands = false;
    while (unboundArguments.length) {
        const arg = unboundArguments.shift();

        // Skip positions for bound arguments.
        while (usedPositions[position]) position++;

        // If the rest option is positional, consume the remaining unbound arguments.
        if (restOption && restOption.option.position <= position) {
            freeArguments.push(arg, ...unboundArguments);
            break;
        }

        if (position === 0 && !disallowCommands) {
            disallowCommands = true;
            const commandProperty = resolver.fromCommandName(arg.argument.value);
            if (commandProperty) {
                const boundArgument = bindArgument(arg, commandProperty, /*args*/ undefined, usedPositions);
                groups = applyGroupRestrictions(boundArgument, groups, /*copyOnModify*/ false);
                boundArguments.push(boundArgument);
                continue;
            }
        }

        const options = resolver.fromPosition(position);
        if (!options || options.length === 0) {
            freeArguments.push(arg);
        }
        else if (options.length === 1) {
            const boundArgument = bindArgument(arg, options[0], /*args*/ undefined, usedPositions);
            groups = applyGroupRestrictions(boundArgument, groups, /*copyOnModify*/ false);
            boundArguments.push(boundArgument);
        }
        else {
            // Attempt each possible binding.
            const possibleBindings: PossibleBinding[] = [];
            for (const option of options) {
                const boundArgument = bindArgument(arg, option, /*args*/ undefined, usedPositions);
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
                        error: `Ambiguous parameter '${arg.text}' at position ${position}. Try specifying the command line option explicitly.`,
                        help: true,
                        status: -1
                    }
                });
            }
        }

        position++;
    }

    // Bind remaining free arguments
    while (freeArguments.length) {
        const parsedArgument = freeArguments.shift();
        if (!restOption) {
            boundArguments.push({
                parsed: parsedArgument,
                key: undefined,
                option: undefined,
                argument: undefined,
                error: { error: `Option '${parsedArgument.text}' was unrecognized.`, help: true, status: -1 }
            });
        }
        else {
            boundArguments.push({
                parsed: parsedArgument,
                key: restOption.key,
                option: restOption.option,
                argument: parsedArgument.argument,
                error: undefined
            });
        }
    }

    return { boundArguments, groups };
}

function bindArgument(parsed: ParsedArgument, optionProperty: CommandLineOptionProperty, args: ParsedArgument[], usedPositions: Map<boolean>): BoundArgument {
    let key: string;
    let option: CommandLineOption;
    let argument: BoundArgumentValue;
    let error: CommandLineParseError;
    if (!optionProperty) {
        error = { error: `Option '${parsed.parameter.parameterName}' was unrecognized.`, help: true, status: -1 };
    }
    else {
        ({ key, option } = optionProperty);

        // If the option can be positional, mark that this position has been used.
        if (option.position !== undefined && option.type !== "command") {
            usedPositions[option.position] = true;
        }

        // If the option takes the rest of the arguments, add remaining arguments.
        const type = option.type
            || ((option.passthru || option.multiple || option.rest) && "string")
            || "boolean";

        // Parse the argument value (if provided or needed).
        switch (type) {
            case "command":
                argument = { value: true };
                break;

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
            error = { error: `Option '${parsed.parameter.parameterName}' expects a value.`, help: true, status: -1 };
        }
    }

    return { parsed, key, option, argument, error };
}

function bindBooleanOption(arg: ParsedArgument): BoundArgumentValue {
    const boolean = arg.argument === undefined || truePattern.test(arg.argument.value);
    const value = arg.parameter && arg.parameter.no ? !boolean : boolean;
    return { value };
}

function bindNumberOption(option: CommandLineOption, arg: ParsedArgument, args: ParsedArgument[]): BoundArgumentValue | CommandLineParseError {
    const argument = arg.argument || readNextArgumentValue(args);
    if (!argument) return undefined;
    if (argument.values) {
        const values = convertNumbers(option, arg, argument.values);
        return isCommandLineParseError(values) ? values : values.length === 1 ? { value: values[0] } : { values };
    }
    else {
        const value = convertNumber(option, arg, argument.value);
        return isCommandLineParseError(value) ? value : { value };
    }
}

function convertNumbers(option: CommandLineOption, parsed: ParsedArgument, items: string[]): number[] | CommandLineParseError {
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

function convertNumber(option: CommandLineOption, parsed: ParsedArgument, item: string): number | CommandLineParseError {
    if (option.convert) {
        const converted = option.convert(item, parsed.parameter.parameterName);
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

function bindStringOption(option: CommandLineOption, arg: ParsedArgument, args: ParsedArgument[]): BoundArgumentValue | CommandLineParseError {
    const argument = arg.argument || readNextArgumentValue(args);
    if (!argument) return undefined;
    if (argument.values) {
        const values = convertStrings(option, arg, argument.values);
        return isCommandLineParseError(values) ? values : values.length === 1 ? { value: values[0] } : { value: argument.value, values };
    }
    else {
        const value = convertString(option, arg, argument.value);
        return isCommandLineParseError(value) ? value : { value };
    }
}

function convertStrings(option: CommandLineOption, parsed: ParsedArgument, items: string[]): string[] | CommandLineParseError {
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

function convertString(option: CommandLineOption, parsed: ParsedArgument, item: string): string | CommandLineParseError {
    if (option.convert) {
        const converted = option.convert(item, parsed.parameter.parameterName);
        if (typeof converted === "string" || typeof converted === "object") {
            return converted;
        }
    }

    return item;
}

function readNextArgumentValue(args: ParsedArgument[]) {
    if (args.length > 0 && args[0].parameter === undefined) {
        return args.shift().argument;
    }

    return undefined;
}

function applyGroupRestrictions(arg: BoundArgument, groups: string[], copyOnModify: boolean) {
    if (!arg.option || !arg.option || arg.error) {
        return groups;
    }

    const option = arg.option;

    // If the option belongs to a group, filter down available groups.
    if (option.groups && option.groups.length > 0) {
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
                    error: `Option '${arg.parsed.text}' conflicts with other options.`,
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
