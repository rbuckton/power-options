import { ParsedCommandLine, CommandLineOption, CommandLineCommand, CommandLineParseError, ParsedArgumentType } from "./types";
import { getParameterName } from "./parser";
import { Resolver, Option } from "./resolver";
import { BoundCommand, BoundArgument } from "./binder";
import { toCommandLineParseError } from "./utils";

export function evaluate<T>(boundCommand: BoundCommand | undefined, boundArguments: BoundArgument[], groups: string[] | undefined, resolver: Resolver): ParsedCommandLine<T> {
    const commandName = boundCommand && boundCommand.command && boundCommand.command.commandName;
    let ok = true;
    let options: any = {};
    let command: CommandLineCommand | undefined;
    let group: string | undefined = undefined;
    let help: boolean | undefined = undefined;
    let error: string | undefined = undefined;
    let status: number | undefined = 0;

    // evaluate bound arguments
    for (const arg of boundArguments) {
        if (!evaluateArgument(arg)) ok = false;
    }

    // select the group to use
    group = selectOptionGroup(groups, resolver.getDefaultGroup());

    // fill defaults and validate required values
    if (ok) ok = fillDefaultValues();
    if (ok) ok = validateRequiredValues();

    if (ok && !help && !error && boundCommand && boundCommand.command) {
        command = boundCommand.command.command;
    }

    return { options, commandName, command, group, help, error, status };

    function evaluateArgument(bound: BoundArgument) {
        if (bound.error) {
            reportError(bound.error);
            return false;
        }

        const option = bound.option;
        if (!option) return false; // TODO: report error

        const argument = bound.argument;
        if (!argument) return false; // TODO: report error

        const key = option.key;
        const parameterName = getParameterName(bound.parsed, option);

        if (option.help && argument.value) {
            help = true;
            status = 0;
            error = undefined;
        }

        // Validate the value for the option.
        if (option.hasValidator) {
            try {
                if (argument.values !== undefined) {
                    for (const item of argument.values) {
                        const result = option.validate(item, parameterName, options);
                        if (result) {
                            reportError(result);
                            return false;
                        }
                    }
                }
                else if (argument.value !== undefined) {
                    const result = option.validate(argument.value!, parameterName, options);
                    if (result) {
                        reportError(result);
                        return false;
                    }
                }
                else {
                    return false; // TODO: report error
                }
            }
            catch (e) {
                reportError(e);
                return false;
            }
        }

        // Add the value to the parsed arguments.
        if (option.multiple) {
            const values = (options[key] || (options[key] = [])) as (string | number)[];
            if (argument.values !== undefined) {
                for (const item of argument.values) {
                    values.push(item);
                }
            }
            else if (typeof argument.value === "string" || typeof argument.value === "number") {
                values.push(argument.value);
            }
            else {
                return false; // TODO: report error
            }
        }
        else {
            if (argument.values !== undefined) {
                reportError(new CommandLineParseError(`Option '${parameterName}' does not allow multiple values.`, /*help*/ true));
                return false;
            }
            else if (argument.value !== undefined) {
                if (option.single && Object.prototype.hasOwnProperty.call(options, key)) {
                    reportOptionError(parameterName, option, new CommandLineParseError(`Option '${parameterName}' already supplied.`, /*help*/ true));
                    return false;
                }
                options[key] = argument.value;
            }
            else {
                return false; // TODO: report error
            }
        }
        return true;
    }

    function selectOptionGroup(groups: string[] | undefined, defaultGroup: string | undefined) {
        if (groups && groups.length > 0) {
            if (defaultGroup && groups.indexOf(defaultGroup) !== -1) {
                return defaultGroup;
            }
            else {
                return groups[0];
            }
        }
        else {
            return defaultGroup;
        }
    }

    function fillDefaultValues() {
        for (const option of resolver.getDefaultOptions(group)) {
            // Set the default value of the option if it has not been provided and has a 'defaultValue' function.
            const key = option.key;
            if (option.hasDefaultValue && !options.hasOwnProperty(key)) {
                try {
                    const defaultValue = option.getDefaultValue(options, group);
                    if (defaultValue !== undefined) {
                        if (option.multiple) {
                            if (Array.isArray(defaultValue)) {
                                options[key] = defaultValue;
                            }
                            else if (typeof defaultValue === "number" || typeof defaultValue === "string") {
                                options[key] = [defaultValue] as number[] | string[];
                            }
                        }
                        else {
                            if (Array.isArray(defaultValue)) {
                                options[key] = defaultValue[0];
                            }
                            else {
                                options[key] = defaultValue;
                            }
                        }
                    }
                }
                catch (e) {
                    reportError(e);
                    return false;
                }
            }
        }
        return true;
    }

    function validateRequiredValues() {
        for (const option of resolver.getRequiredOptions(group)) {
            // If the option is required and is not present, report an error.
            const key = option.key;
            if (option.required && !options.hasOwnProperty(key)) {
                const parameterName = getParameterName(/*parsed*/ undefined, option);
                reportError(new CommandLineParseError(`Option '${parameterName}' is required.`, /*help*/ true));
                return false;
            }
        }

        return true;
    }

    function reportOptionError(parameterName: string, option: Option, e: any) {
        reportError(option ? option.error(parameterName, toCommandLineParseError(e)) : e);
    }

    function reportError(e: any) {
        if (!help && !error) {
            ({ message: error, help = false, status = -1 } = toCommandLineParseError(e));
        }
    }
}
