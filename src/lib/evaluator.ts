import { ParsedCommandLine, CommandLineOption, CommandLineParseError, ParsedArgs, ParsedArgumentType } from "./options";
import { OptionResolver } from "./resolver";
import { BoundArgument, isCommandLineParseError } from "./binder";

export function evaluate<T>(boundArguments: BoundArgument[], groups: string[], resolver: OptionResolver): ParsedCommandLine<T> {
    let ok = true;
    let options = <T & ParsedArgs>{};
    let group: string = undefined;
    let help: boolean = undefined;
    let error: string = undefined;
    let status = 0;

    // evaluate bound arguments
    for (const arg of boundArguments) {
        if (!evaluateArgument(arg, resolver)) ok = false;
    }

    // select the group to use
    group = selectOptionGroup(groups, resolver.defaultGroup);

    // fill defaults and validate required values
    if (ok) ok = fillDefaultValues(resolver);
    if (ok) ok = validateRequiredValues(resolver);

    return { options, group, help, error, status };

    function evaluateArgument(bound: BoundArgument, resolver: OptionResolver) {
        if (bound.error) {
            reportError(bound.error);
            return false;
        }

        const { parsed: { parameter: { parameterName } }, key, option, argument } = bound;

        if (option.help && argument.value) {
            help = true;
            status = 0;
            error = undefined;
        }

        // Validate the value for the option.
        if (option.validate) {
            if (argument.values) {
                for (const item of argument.values) {
                    const result = option.validate(item, parameterName, options);
                    if (result) {
                        reportError(result);
                        return false;
                    }
                }
            }
            else {
                const result = option.validate(argument.value, parameterName, options);
                if (result) {
                    reportError(result);
                    return false;
                }
            }
        }

        // Add the value to the parsed arguments.
        if (option.multiple) {
            const values = (options[key] || (options[key] = [])) as string[] | number[] as (string | number)[];
            if (argument.values) {
                for (const item of argument.values) {
                    values.push(item);
                }
            }
            else {
                values.push(argument.value as string | number);
            }
        }
        else {
            if (argument.values && argument.value === undefined) {
                reportError({ error: `Option '${parameterName}' does not allow multiple values.`, help: true, status: -1 });
                return false;
            }

            if (option.single && options.hasOwnProperty(key)) {
                reportOptionError(parameterName, option, { error: `Option '${parameterName}' already supplied.`, help: true, status: -1 });
                return false;
            }

            options[key] = argument.value;
        }

        return true;
    }

    function selectOptionGroup(groups: string[], defaultGroup: string) {
        if (groups && groups.length >= 1) {
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

    function fillDefaultValues(resolver: OptionResolver) {
        for (const { key, option } of resolver.getDefaultOptions(group)) {
            // Set the default value of the option if it has not been provided and has a 'defaultValue' function.
            if (option.defaultValue && !options.hasOwnProperty(key)) {
                const defaultValue = option.defaultValue(options, group);
                if (defaultValue !== undefined) {
                    if (isCommandLineParseError(defaultValue)) {
                        reportError(defaultValue);
                        return false;
                    }
                    else {
                        options[key] = option.multiple ? [].concat(defaultValue) : defaultValue;
                    }
                }
            }
        }

        return true;
    }

    function validateRequiredValues(resolver: OptionResolver) {
        for (const { key, option } of resolver.getRequiredOptions(group)) {
            // If the option is required and is not present, report an error.
            if (option.required && !options.hasOwnProperty(key)) {
                const parameterName =
                    option.longName ? "--" + option.longName :
                    option.shortName ? "-" + option.shortName :
                        "--" + key;
                reportError({
                    error: `Option '${parameterName}' is required.`,
                    help: true
                });
                return false;
            }
        }

        return true;
    }

    function reportOptionError(arg: string, option: CommandLineOption, parseError: CommandLineParseError) {
        if (option && option.error) {
            parseError = option.error(arg, parseError) || parseError;
        }

        reportError(parseError);
    }

    function reportError(parseError: CommandLineParseError) {
        if (!help && !error) {
            ({ error, help, status = -1 } = parseError);
        }
    }
}