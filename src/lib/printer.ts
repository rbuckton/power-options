import * as path from "path";
import * as tty from "tty";
import * as chalk from "chalk";
import { Query, Queryable } from "iterable-query";
import { EOL } from "os";
import { Resolver, Command, Option, OptionSet } from "./resolver";
import { CommandLine } from "./options";
import { getParameterName } from "./parser";

declare module "chalk" {
    interface ChalkStyleMap { [key: string]: import("chalk").ChalkStyleElement; }
    interface ChalkStyle { [key: string]: import("chalk").ChalkChain | boolean; }
}

const whitespacePattern = /^\s$/;

export interface HelpWriterOptions {
    padding?: number;
    width?: number;
    maxWidth?: number;
    color?: boolean;
    styles?: Styles;
    level?: "default" | "hidden";
}

interface HelpText {
    kind: "text";
    text: string;
    padding: number;
}

interface HelpDefinition {
    kind: "definition";
    term: string;
    definition: string;
}

interface HelpSectionBreak {
    kind: "break";
}

interface HelpOption {
    kind: "option";
    option: Option;
}

interface HelpCommand {
    kind: "command";
    command: Command;
}

type HelpEntry = HelpText | HelpDefinition | HelpCommand | HelpOption | HelpSectionBreak;

const enum HelpWriterState {
    Usage,
    Description,
    Commands,
    Options,
    Examples
}

export interface Styles {
    [key: string]: string | chalk.ChalkChain;
}

export class HelpWriter {
    private commandLine: CommandLine;
    private resolver: Resolver;
    private padding: number = 1;
    private width: number = 120;
    private useColors: boolean = false;
    private printShortNames: boolean = false;
    private entries: HelpEntry[] = [];
    private state?: HelpWriterState;
    private hasWrittenCommand: boolean;
    private hasWrittenCommandOption = false;
    private examplesHeader?: HelpText;
    private command?: Command;
    private lastCommand?: Command;
    private lastOptionSet?: OptionSet;
    private styles: Styles;
    private level: "default" | "hidden";

    constructor(commandLine: CommandLine, command: Command | undefined, options: HelpWriterOptions = {}) {
        const { padding = 1, width = 120, maxWidth = 190, color = false, styles, level } = options || {} as HelpWriterOptions;
        this.commandLine = commandLine;
        this.command = command;
        this.resolver = command || commandLine;
        this.level = level || "default";
        this.hasWrittenCommand = command ? true : false;
        this.padding = padding;
        this.width = Math.min(width, Math.max(maxWidth, 160));
        this.useColors = color;
        this.styles = Object.assign({
            text: "inherit",
            executable: chalk.yellow.bold,
            header: chalk.white.bold,
            command: chalk.cyan.bold,
            passthru: chalk.gray,
            option: "inherit",
            optionHighlight: chalk.white.bold,
            param: chalk.gray,
            example: chalk.gray,
            usage: "inherit",
            description: "inherit",
            note: chalk.gray
        }, styles);
    }

    public addUsages(usages: Queryable<string>) {
        Query.from(usages).forEach(usage => {
            this.addUsage(usage);
        });
    }

    public addUsage(usage: string) {
        if (usage) {
            const prefix = this.switchTo(HelpWriterState.Usage) ? "usage: " : "      ";
            this.addRawText(this.color(prefix, "header") + this.color(this.format(usage), "usage"));
        }
    }

    public addDefaultUsage() {
        if (this.state !== HelpWriterState.Usage) {
            const hasCommands = this.command !== undefined || (this.commandLine.hasCommands && Query.from(this.commandLine.getCommands()).where(command => this.isVisible(command)).some());
            const printedUsages = new Set<string>();
            const groups: Queryable<string | undefined> = this.resolver.groups.length ? this.resolver.groups : [undefined];
            Query.from(groups).forEach(group => {
                const availableOptions = Query
                    .from(this.resolver.getOptions(group))
                    .where(option => this.isVisible(option))
                    .toArray();

                const positionalOptions = Query
                    .from(availableOptions)
                    .where(option => option.position !== undefined && !option.passthru)
                    .orderBy(option => option.position)
                    .toArray();

                const requiredOptions = Query
                    .from(availableOptions)
                    .where(option => option.position === undefined && !option.passthru && option.required)
                    .toArray();

                const restOption = Query.from(availableOptions).where(option => option.rest).single();
                const passthruOption = Query.from(availableOptions).where(option => option.passthru).single();

                const usage: string[] = [this.color(this.commandLine.name, "executable")];
                if (hasCommands) {
                    usage.push(this.format("$commandPath"));
                }

                let numOptions = 0;
                for (const option of positionalOptions) {
                    usage.push(this.format(option.toUsageString()));
                    numOptions++;
                }

                for (const option of requiredOptions) {
                    usage.push(this.format(option.toUsageString()));
                    numOptions++;
                }

                if (restOption && this.isVisible(restOption) && restOption.position === undefined) {
                    usage.push(this.format(restOption.toUsageString()));
                    numOptions++;
                }

                if (passthruOption && this.isVisible(passthruOption)) {
                    numOptions++;
                }

                if (availableOptions.length !== numOptions) {
                    usage.push(this.color("[options]", "option"));
                }

                if (passthruOption && this.isVisible(passthruOption)) {
                    usage.push(this.format(passthruOption.toUsageString()));
                }

                const usageText = usage.join(" ");
                if (!printedUsages.has(usageText)) {
                    const prefix = this.switchTo(HelpWriterState.Usage) ? "usage: " : "       ";
                    this.addRawText(this.color(prefix, "header") + this.color(usageText, "usage"));
                    printedUsages.add(usageText);
                }
            });
        }
    }

    public addExamples(examples: Queryable<string>) {
        Query.from(examples).forEach(example => {
            this.addExample(example);
        });
    }

    public addExample(example: string) {
        if (example) {
            if (this.switchTo(HelpWriterState.Examples)) {
                this.examplesHeader = this.addRawText(this.color("example:", "header"));
            }
            else if (this.examplesHeader) {
                this.examplesHeader.text = this.color("examples:", "header");
            }

            this.addRawText(EOL + this.color(chalk.stripColor(this.format(example)), "example"), 1);
        }
    }

    public addDescription(description: string) {
        if (description) {
            this.switchTo(HelpWriterState.Description);
            this.addRawText(this.color(this.format(description), "description"));
        }
    }

    public addCommands(commands: Queryable<Command>) {
        Query.from(commands).forEach(command => {
            this.addCommand(command);
        });
    }

    public addCommand(command: Command) {
        if (command && this.isVisible(command)) {
            if (this.switchTo(HelpWriterState.Commands)) {
                this.addRawText(this.color("commands:", "header"));
                this.hasWrittenCommand = true;
            }

            this.entries.push({ kind: "command", command });
        }
    }

    public addOptions(options: Queryable<Option>) {
        const optionsBySet = Query
            .from(options)
            .where(option => this.isVisible(option))
            .groupBy(option => option.optionSet && !option.optionSet.merge ? option.optionSet : undefined)
            .orderBy(group => group.key ? 1 : 0);

        optionsBySet.forEach(group => {
            Query
                .from(group)
                .forEach(option => {
                    this.addOption(option);
                });
        });
    }

    public addOption(option: Option) {
        if (option && this.isVisible(option)) {
            const command = option.command;
            const optionSet = option.optionSet && !option.optionSet.merge ? option.optionSet : undefined;
            if (this.switchTo(HelpWriterState.Options) || this.lastCommand !== command || this.lastOptionSet !== optionSet) {
                this.lastCommand = command;
                this.lastOptionSet = optionSet;
                this.addBreak();

                let header = "";
                if (command) {
                    header += `${this.color(command.commandName, "command")} `;
                    this.hasWrittenCommandOption = true;
                }
                else if (this.hasWrittenCommandOption || this.hasWrittenCommand) {
                    header += "general ";
                }

                if (optionSet) {
                    header += `'${optionSet.setName}' `;
                }

                this.addRawText(this.color(header + "options:", "header"));
            }

            this.entries.push({ kind: "option", option });
        }
    }

    public addDefinition(term: string, definition: string) {
        const entry: HelpDefinition = { kind: "definition", term: this.format(term), definition: this.format(definition) };
        this.entries.push(entry);
    }

    public addText(text: string = "", padding = 0) {
        this.addRawText(this.format(text), padding);
    }

    private addRawText(text: string, padding = 0) {
        const entry: HelpText = { kind: "text", text, padding };
        this.entries.push(entry);
        return entry;
    }

    private addBreak() {
        const entries = this.entries;
        const numEntries = entries.length;
        if (numEntries > 0 && entries[numEntries - 1].kind !== "break") {
            entries.push({ kind: "break" });
        }
    }

    public write(out: NodeJS.WritableStream) {
        let termWidth = 0;
        let hasShortNames = false;
        for (const entry of this.entries) {
            if (entry.kind === "option") {
                const option = entry.option;
                if (option) {
                    let size = 0;
                    if (option.passthru) {
                        size += 3;
                    }
                    else {
                        if (option.shortName && (!option.longName || option.type !== "boolean" || option.defaultValue !== true)) {
                            hasShortNames = true;
                        }

                        if (option.longName) {
                            size += option.longName.length + 3;
                        }

                        if (option.param) {
                            size += option.param.length + 3;
                            if (option.multiple) {
                                size += 2;
                            }
                        }
                    }

                    if (termWidth < size) {
                        termWidth = size;
                    }
                }
            }
        }

        if (hasShortNames) {
            termWidth += 4;
        }

        for (const entry of this.entries) {
            switch (entry.kind) {
            	case "definition":
                    termWidth = Math.max(termWidth, entry.term.length + 1);
                    break;
                case "command":
                    termWidth = Math.max(termWidth, entry.command.commandName.length + 2);
                    break;
            }
        }

        // write each line
        const remainder = this.width - termWidth - this.padding;
        let sectionBreakRequested = false;
        for (let entry of this.entries) {
            switch (entry.kind) {
                case "option":
                    const option = entry.option;
                    let term = " ";
                    if (option.passthru) {
                        if (hasShortNames) {
                            term += `   `;
                        }

                        term += `-- `;
                    }
                    else {
                        if (option.shortName && (!option.longName || option.type !== "boolean" || option.defaultValue !== true)) {
                            term += this.color(`-${option.shortName}`, "option");
                            if (option.longName) {
                                term += ` `;
                            }
                        }
                        else if (hasShortNames) {
                            term += `   `;
                        }

                        if (option.longName) {
                            if (option.type === "boolean" && option.defaultValue === true) {
                                term += this.color(`--no-${option.longName}`, "option");
                            }
                            else {
                                term += this.color(`--${option.longName}`, "option");
                            }
                        }

                        if (option.param) {
                            term += ` `;
                        }

                        if (option.param) {
                            term += this.color(`<${option.param}${option.multiple ? "[]" : ""}>`, "param");
                        }
                    }

                    entry = { kind: "definition", term, definition: this.format(option.description || "", option.command, option, /*highlight*/ true) };
                    break;

                case "command":
                    const command = entry.command;
                    entry = { kind: "definition", term: " " + this.color(command.commandName, "command"), definition: this.format(command.summary, command) };
                    break;
            }

            switch (entry.kind) {
            	case "definition":
                    const termLines = entry.term ? wordWrap(entry.term, termWidth) : [];
                    const definitionLines = entry.definition ? wordWrap(entry.definition, remainder) : [];
                    const lineCount = Math.max(termLines.length, definitionLines.length);
                    for (let i = 0; i < lineCount; ++i) {
                        const definitionLine = i < definitionLines.length ? definitionLines[i] : "";
                        const termLine = padRight(i < termLines.length ? termLines[i] : "", definitionLine ? termWidth + this.padding : 0);
                        writeln(out, this.color(termLine + definitionLine, "text"));
                    }
                    break;
                case "text":
                    const padding = Math.max(entry.padding, 0);
                    const lines = wordWrap(this.color(entry.text, "text"), this.width - padding);
                    for (const line of lines) {
                        writeln(out, padding ? padLeft("", padding) + line : line);
                    }
                    break;
                case "break":
                    sectionBreakRequested = true;
                    break;
            }
        }

        function writeln(out: NodeJS.WritableStream, text = "") {
            if (sectionBreakRequested) {
                out.write(EOL);
                sectionBreakRequested = false;
            }

            out.write(text + EOL);
        }
    }

    private isVisible({ visibility }: { visibility: "default" | "hidden" }) {
        switch (visibility) {
            case "hidden": return this.level === "hidden";
        }
        return true;
    }

    private switchTo(state: HelpWriterState) {
        if (this.state === undefined) {
            this.state = state;
            return true;
        }

        if (this.state !== state) {
            this.addBreak();
            this.state = state;
            return true;
        }

        return false;
    }

    private format(text: string, command?: Command, option?: Option, highlight?: boolean): string {
        if (command === undefined) command = this.command;

        const formatPattern = /(<\w+(?:\[\])?>)|(^|\b|\s|\[)(-(\w)\b|--(?:no[\-_])?([\w\-_]+)|(--))|\$([a-z]+)|\${(.*?):(\w+)}/gi;
        return text.replace(formatPattern, (_, param, space, parameterName, shortName, longName, passthru, name, text, color) => {
            if (param) {
                return this.color(param, param === "<command>" ? "command" : "param");
            }
            else if (shortName || longName) {
                const resolver: Resolver = this.command || this.commandLine;
                const option = longName ? resolver.fromLongName(longName) : shortName ? resolver.fromShortName(shortName) : undefined;
                if (option) {
                    return space + this.color(parameterName, highlight ? "optionHighlight" : "option");
                }
            }
            else if (passthru) {
                const resolver: Resolver = this.command || this.commandLine;
                if (resolver.getPassthru()) {
                    return space + this.color(passthru, "passthru");
                }
            }
            else if (name) {
                switch (name) {
                    case "executable":
                    case "executableName":
                        if (this.commandLine.name) {
                            return this.color(this.commandLine.name, "executable");
                        }
                        break;

                    case "commandPath":
                        if (command) {
                            let current: Command | undefined = command;
                            let result = "";
                            while (current) {
                                if (result) result += " ";
                                result += this.color(current.commandName, "command");
                                current = current.parentCommand;
                            }
                            return result;
                        }
                        // falls through

                    case "command":
                    case "commandName":
                        if (command) {
                            return this.color(command.commandName, "command");
                        }
                        else if (option && option.command) {
                            return this.color(option.command.commandName, "command");
                        }
                        else {
                            return this.color("<command>", "command");
                        }

                    case "shortName":
                        if (option && option.shortName) {
                            return this.color("-" + option.shortName, highlight ? "optionHighlight" : "option");
                        }
                        break;

                    case "longName":
                        if (option && option.longName) {
                            return this.color("--" + option.longName, highlight ? "optionHighlight" : "option");
                        }
                        break;

                    case "parameterName":
                        if (option && option.longName) {
                            return this.color("--" + option.longName, highlight ? "optionHighlight" : "option");
                        }
                        if (option && option.shortName) {
                            return this.color("-" + option.shortName, highlight ? "optionHighlight" : "option");
                        }
                        break;

                    case "param":
                        if (option) {
                            return this.color("<" + (option.param || option.type) + (option.multiple ? "[]>" : ">"), "param");
                        }
                        break;
                }
            }
            else if (color) {
                return this.color(this.format(text, command, option, highlight), color);
            }
            return _;
        });
    }

    private color(text: string, style: string | chalk.ChalkChain | undefined) {
        if (this.useColors && style && text) {
            if (typeof style === "string") {
                style = this.getStyle(style);
            }
            if (typeof style === "function") {
                return style(text);
            }
        }
        return text;
    }

    private getStyle(color: string): chalk.ChalkChain | undefined {
        const colors = color.split(/\s+/g);
        let chain: chalk.ChalkChain | undefined;
        for (const color of colors) {
            chain = this.getStyleWorker(color, chain, new Set<string>());
        }
        return chain;
    }

    private getStyleWorker(color: string, chain: chalk.ChalkChain | undefined, set: Set<string>): chalk.ChalkChain | undefined {
        const link = this.getLink(color, chain);
        if (link === undefined) {
            return chain;
        }
        else if (typeof link === "function") {
            return link;
        }
        else {
            if (set.has(color)) {
                return chain;
            }

            set.add(color);
            const style = this.getStyleWorker(link, chain, set);
            set.delete(color);
            return style;
        }
    }

    private getLink(color: string, chain: chalk.ChalkChain | undefined): string | chalk.ChalkChain | undefined {
        switch (color) {
            case "call":
            case "apply":
            case "bind":
            case "styles":
            case "name":
            case "length":
            case "hasColor":
            case "stripColor":
            case "supportsColor":
            case "enabled":
            case "arguments":
            case "inherit":
                return undefined;
            default:
                if (Object.prototype.hasOwnProperty.call(this.styles, color)) {
                    return this.styles[color];
                }
                break;
        }
        return chain ? chain[color] : (<any>chalk)[color];
    }
}

function padLeft(text: string, size: number, char: string = " ") {
    char = chalk.stripColor(char);
    let length = chalk.stripColor(text).length;
    while (length < size) {
        text = char + text;
        length++;
    }

    return text;
}

function padRight(text: string, size: number, char: string = " ") {
    char = chalk.stripColor(char);
    let length = chalk.stripColor(text).length;
    while (length < size) {
        text += char;
        length++;
    }

    return text;
}

function isWhitespace(ch: string, excludeLineTerminator?: boolean) {
    if (excludeLineTerminator && (ch === '\r' || ch === '\n')) return false;
    return whitespacePattern.test(ch);
}

interface TextRange {
    pos: number; // range start (including whitespace)
    start: number; // range start (excluding whitespace)
    end: number; // range end
    newLine?: boolean; // range is a new line
}

function wordWrap(text: string, width: number) {
    const lines: string[] = [];
    let line: string = "";
    Query.from(wordScan(text)).forEach(word => {
        if (word.newLine) {
            lines.push(line);
            line = "";
        }
        else {
            const fragment = text.substring(word.start, word.end);
            const fullWidth = word.start - word.pos + chalk.stripColor(fragment).length;
            if (line.length > 0 && line.length + fullWidth > width) {
                if (line || lines.length) lines.push(line);
                line = fragment;
            }
            else {
                line += text.substring(word.pos, word.start) + fragment;
            }
        }
    });

    if (line) {
        lines.push(line);
    }

    return lines;
}

function wordScan(text: string): IterableIterator<TextRange> {
    let end = 0;
    let pos = 0;
    return {
        [Symbol.iterator]() {
            return this;
        },
        next() {
            pos = end;
            while (end < text.length) {
                const ch = text.charAt(end);
                if (ch === '\r') {
                    const start = end;
                    end++;
                    if (end < text.length && text.charAt(end) === '\n') {
                        end++;
                    }

                    return { value: { pos, start, end, newLine: true }, done: false };
                }
                else if (ch === '\n') {
                    const start = end;
                    end++;
                    return { value: { pos, start, end, newLine: true  }, done: false };
                }
                else if (!whitespacePattern.test(ch)) {
                    const start = end;
                    while (end < text.length) {
                        const ch = text.charAt(end);
                        if (whitespacePattern.test(ch)) {
                            break;
                        }
                        end++;
                    }

                    return { value: { pos, start, end }, done: false };
                }
                else {
                    end++;
                }
            }

            return { done: true, value: undefined! };
        },
        return() {
            end = text.length;
            return { done: true, value: undefined! };
        }
    };
}