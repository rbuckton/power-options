import { ParsedCommandLine, CommandLineParseError, CommandPath, HelpDetails } from "./types";
import { getParameterName } from "./parser";
import { Resolver, Option, Command } from "./resolver";
import { BoundCommand, BoundArgument } from "./binder";
import { toCommandLineParseError } from "./utils";

export function evaluate<T>(boundCommand: BoundCommand | undefined, boundArguments: BoundArgument[], groups: string[] | undefined, resolver: Resolver): ParsedCommandLine<T> {
    let commandName: string | undefined = boundCommand && boundCommand.command && boundCommand.command.commandName;
    let commandPath: string[] | undefined;
    let options: any = {};
    let command: Command | undefined;
    let group: string | undefined = undefined;
    let help: ParsedCommandLine<any>["help"] = undefined;
    let error: string | undefined = undefined;
    let status: number | undefined = 0;

    if (boundCommand) {
        if (boundCommand.command) {
            command = boundCommand.command;
            commandName = boundCommand.parsed!.text;
            commandPath = [commandName];
        }
        let parent = boundCommand.parent;
        while (parent) {
            if (!commandPath) commandPath = [];
            commandPath.unshift(parent.command!.commandName);
            parent = parent.parent;
        }
    }

    if (boundCommand && boundCommand.error) {
        reportError(boundCommand.error);
    }

    // evaluate bound arguments
    for (const arg of boundArguments) {
        evaluateArgument(arg);
    }

    // select the group to use
    group = selectOptionGroup(groups, resolver.getDefaultGroup());

    // fill defaults and validate required values
    if (!error) fillDefaultValues();
    if (!error) validateRequiredValues();
    if (!help && command) {
        if (command.container) {
            help = true;
        }
        else if (command.help) {
            commandName = undefined;
            commandPath = options.commandPath;
            let helpDetails = HelpDetails.None;
            if (options.full) helpDetails |= HelpDetails.Full;
            if (options.examples) helpDetails |= HelpDetails.Examples;
            if (options.advanced) helpDetails |= HelpDetails.Advanced;
            help = helpDetails || true;
        }
    }

    return {
        options,
        commandName,
        commandPath: commandPath as CommandPath | undefined,
        command: command && command.rawCommand,
        group,
        help,
        error,
        status,
        handled: false
    };

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
                }
            }
        }
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
        if (!error) {
            const parseError = toCommandLineParseError(e);
            error = parseError.message;
            if (parseError.help && !help) help = true;
            if (parseError.status !== -1 || !status) status = parseError.status;
        }
    }
}
