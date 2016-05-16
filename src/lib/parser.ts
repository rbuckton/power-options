import { readFileSync } from "fs";

const optionPattern = /^([-/](\w)|--(no[\-_])?([\-\w_]+))(?:([:=])(.*))?$/;
const whitespacePattern = /\s/;
const responseFilePattern = /^@(.+?)\s*$/;

export interface ParseResult {
    parsedArguments: ParsedArgument[];
}

export interface ParsedArgument {
    text: string;
    parameter?: ParsedParameter;
    argument?: ParsedArgumentValue;
}

export interface ParsedParameter {
    parameterName?: string;
    shortName?: string;
    longName?: string;
    passthru?: boolean;
    no?: boolean;
}

export interface ParsedArgumentValue {
    value?: string;
    values?: string[];
}

export interface ParserHost {
    readFileSync(file: string): string;
}

export function parse(args: string[], host?: ParserHost): ParseResult {
    // Parse each argument
    const parsedArguments: ParsedArgument[] = [];
    while (args.length) {
        const arg = args.shift();
        parseArgument(arg, args, parsedArguments, host);
    }

    return { parsedArguments };
}

function parseArgument(arg: string, args: string[], parsedArguments: ParsedArgument[], host: ParserHost) {
    return tryParsePassthruOption(arg, args, parsedArguments, host)
        || tryParseOption(arg, args, parsedArguments, host)
        || tryParseResponseFile(arg, args, parsedArguments, host)
        || tryParseArgumentValue(arg, args, parsedArguments, host);
}

function tryParsePassthruOption(arg: string, args: string[], parsedArguments: ParsedArgument[], host: ParserHost) {
    if (arg === "--") {
        parsedArguments.push({
            text: arg,
            parameter: {
                parameterName: arg,
                shortName: undefined,
                longName: undefined,
                passthru: true,
                no: false
            },
            argument: {
                values: args.splice(0)
            }
        });
        return true;
    }
    return false;
}

function tryParseOption(arg: string, args: string[], parsedArguments: ParsedArgument[], host: ParserHost) {
    const match = optionPattern.exec(arg);
    if (match) {
        const [, parameterName, shortName, no, longName, hasValue, value] = optionPattern.exec(arg);
        const parameter: ParsedParameter = {
            parameterName,
            shortName,
            longName,
            passthru: false,
            no: !!no
        };

        let argument: ParsedArgumentValue;
        if (hasValue) {
            if (value) {
                argument = parseArgumentValue(value, args);
            }
            else if (args.length) {
                argument = parseArgumentValue(args.shift(), args);
            }
        }

        parsedArguments.push({
            text: arg,
            parameter,
            argument
        });
        return true;
    }

    return false;
}

function tryParseResponseFile(arg: string, args: string[], parsedArguments: ParsedArgument[], host: ParserHost) {
    const match = responseFilePattern.exec(arg);
    if (match) {
        const file = match[1];
        const content = host
            ? host.readFileSync(file)
            : readFileSync(file, "utf8");
        for (const arg of content.split(/\r\n?|\n/g)) {
            if (arg) {
                args.unshift(arg);
            }
        }
        return true;
    }
    return false;
}

function tryParseArgumentValue(arg: string, args: string[], parsedArguments: ParsedArgument[], host: ParserHost) {
    // Hold onto unmatched arguments for later positional matching.
    parsedArguments.push({
        text: arg,
        parameter: undefined,
        argument: parseArgumentValue(arg, args)
    });
    return true;
}

function parseArgumentValue(text: string, args: string[]): ParsedArgumentValue {
    const values: string[] = [];
    let value = text;
    let pos = skipLeadingWhitespace(text, 0);
    let startPos = pos;
    while (pos < text.length) {
        const ch = text.charAt(pos);
        if (ch === ",") {
            // list separator
            const end = trimTrailingWhitespace(text, pos);
            if (end > startPos) {
                values.push(text.substring(startPos, end));
            }

            startPos = skipLeadingWhitespace(text, pos + 1);
            if (startPos === text.length) {
                // trailing comma, next argument continues list.
                if (args.length > 0) {
                    text = args.shift();
                    value += " " + text;
                    pos = skipLeadingWhitespace(text, 0);
                    startPos = pos;
                    continue;
                }
            }
        }
        pos++;
    }

    if (values.length === 0) {
        return { value };
    }

    const end = trimTrailingWhitespace(text, text.length);
    if (end > startPos) {
        values.push(text.substring(startPos, end));
    }

    return { value, values };
}

function skipLeadingWhitespace(text: string, pos: number) {
    while (pos < text.length) {
        const ch = text.charAt(pos);
        if (!whitespacePattern.test(ch)) {
            break;
        }

        pos++;
    }

    return pos;
}

function trimTrailingWhitespace(text: string, end: number) {
    while (end > 0) {
        const ch = text.charAt(end - 1);
        if (!whitespacePattern.test(ch)) {
            break;
        }

        end--;
    }

    return end;
}