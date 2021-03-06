import * as chalk from "chalk";
import { Query, Queryable, from } from "iterable-query";
import { EOL } from "os";
import { Resolver, Command, Option, OptionSet } from "./resolver";
import { CommandLine } from "./commandLine";
import { CommandLineVisibility } from "./types";

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
    level?: CommandLineVisibility;
    examples?: boolean;
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

interface HelpMeasurements {
    hasShortNames: boolean;
    termWidth: number;
    remainder: number;
}

const enum HelpWriterState {
    Usage,
    Description,
    Commands,
    Options,
    Examples,
    Remarks
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
    private printExamples = false;
    private hasSkippedExamples = false;
    private examplesHeader?: HelpText;
    private command?: Command;
    private lastCommand?: Command;
    private lastOptionSet?: OptionSet;
    private styles: Styles;
    private level: CommandLineVisibility;
    private hasSkippedAdvancedOptions = false;

    constructor(commandLine: CommandLine, command: Command | undefined, options: HelpWriterOptions = {}) {
        const { padding = 1, width = 120, maxWidth = 190, color = false, styles, level = "visible", examples = false } = options || {} as HelpWriterOptions;
        this.commandLine = commandLine;
        this.command = command;
        this.resolver = command || commandLine;
        this.level = level;
        this.hasWrittenCommand = command ? true : false;
        this.padding = padding;
        this.width = Math.min(width, Math.max(maxWidth, 160));
        this.useColors = color;
        this.printExamples = examples;
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

    public addHeading(heading: string) {
        if (heading) {
            this.addRawText(this.color(heading, "header"));
        }
    }

    public addUsages(usages: Iterable<string>) {
        for (const usage of usages) {
            this.addUsage(usage);
        };
    }

    public addUsage(usage: string) {
        if (usage) {
            const prefix = this.switchTo(HelpWriterState.Usage) ? "usage: " : "      ";
            this.addRawText(this.color(prefix, "header") + this.color(this.format(usage), "usage"));
        }
    }

    public addDefaultUsage() {
        if (this.state !== HelpWriterState.Usage) {
            const isContainer = this.resolver instanceof Command ? this.resolver.container : !!this.commandLine.settings.container;
            const hasCommands = this.resolver.hasCommands && from(this.resolver.getCommands()).some(command => this.isVisible(command) && !command.autoGenerated);

            const printedUsages = new Set<string>();
            for (const group of from<string | undefined>(this.resolver.groups).defaultIfEmpty(undefined)) {
                const availableOptions = from(this.resolver.getOptions(group))
                    .where(option => this.isVisible(option))
                    .toArray();

                const positionalOptions = from(availableOptions)
                    .where(option => option.position !== undefined && !option.passthru)
                    .orderBy(option => option.position)
                    .toArray();

                const requiredOptions = from(availableOptions)
                    .where(option => option.position === undefined && !option.passthru && option.required)
                    .toArray();

                const restOption = from(availableOptions)
                    .where(option => option.rest)
                    .single();

                const passthruOption = from(availableOptions)
                    .where(option => option.passthru)
                    .single();

                const usage: string[] = [this.color(this.commandLine.name, "executable")];
                if (this.command) {
                    usage.push(this.format("$commandPath"));
                }

                if (hasCommands) {
                    usage.push(this.format(isContainer ? `<command>` : "[<command>]"));
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
            }
        }
    }

    public addDescription(description: string) {
        if (description) {
            this.switchTo(HelpWriterState.Description);
            this.addRawText(this.color(this.format(description), "description"));
        }
    }

    public addCommands(commands: Iterable<Command>) {
        for (const command of commands) {
            this.addCommand(command);
        }
    }

    public addCommand(command: Command) {
        if (command && this.isVisible(command)) {
            const parentCommand = command.parentCommand;
            if (this.switchTo(HelpWriterState.Commands) || this.lastCommand !== parentCommand) {
                this.lastCommand = parentCommand;
                this.addHeading(parentCommand ? this.format("$commandName commands:", parentCommand) : "commands:");
                this.hasWrittenCommand = true;
            }
            this.entries.push({ kind: "command", command });
        }
    }

    public addOptions(options: Iterable<Option>) {
        const optionsBySet = from(options)
            .where(option => this.isVisible(option))
            .groupBy(option => option.parentOptionSet && !option.parentOptionSet.merge ? option.parentOptionSet : undefined)
            .orderBy(group => group.key ? 1 : 0)
            .selectMany(group => group);

        for (const option of optionsBySet) {
            this.addOption(option);
        }

        if (this.level === "visible" && !this.hasSkippedAdvancedOptions && from(options).some(option => option.visibility === "advanced")) {
            this.hasSkippedAdvancedOptions = true;
        }
    }

    public addOption(option: Option) {
        if (this.isVisible(option)) {
            const command = option.parentCommand;
            const optionSet = option.parentOptionSet && !option.parentOptionSet.merge ? option.parentOptionSet : undefined;
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
                this.addHeading(header + "options:");
            }
            this.entries.push({ kind: "option", option });
        }
        else if (option.visibility === "advanced") {
            this.hasSkippedAdvancedOptions = true;
        }
    }

    public addDefinition(term: string, definition: string) {
        const entry: HelpDefinition = { kind: "definition", term: this.format(term), definition: this.format(definition) };
        this.entries.push(entry);
    }

    public addText(text: string = "", padding = 0) {
        this.addRawText(this.format(text), padding);
    }

    public addExamples(examples: Iterable<string>) {
        for (const example of examples) {
            this.addExample(example);
        }
    }

    public addExample(example: string) {
        if (example) {
            if (this.printExamples) {
                if (this.switchTo(HelpWriterState.Examples)) {
                    this.examplesHeader = this.addRawText(this.color("example:", "header"));
                }
                else if (this.examplesHeader) {
                    this.examplesHeader.text = this.color("examples:", "header");
                }
                this.addRawText(EOL + this.color(chalk.stripColor(this.format(example)), "example"), 1);
            }
            else {
                this.hasSkippedExamples = true;
            }
        }
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

    private addRemarks() {
        const hasSkippedAdvancedOptions = this.level === "visible" && this.hasSkippedAdvancedOptions;
        const hasSkippedExamples = this.hasSkippedExamples;
        if ((hasSkippedAdvancedOptions || hasSkippedExamples) && this.switchTo(HelpWriterState.Remarks)) {
            this.addRawText(this.color("remarks:", "header"));
            if (hasSkippedAdvancedOptions) this.addRawText(this.format(`For advanced options, type: '$executable $help$space$(commandPath=) --advanced'`), 1);
            if (hasSkippedExamples) this.addRawText(this.format(`For examples, type: '$executable $help$space$(commandPath=) --examples'`), 1);
            this.addRawText(this.format(`For full help, type: '$executable $help$space$(commandPath=) --full'`), 1);
        }
    }

    public write(out: NodeJS.WritableStream) {
        if (this.state !== HelpWriterState.Remarks) {
            this.addRemarks();
        }

        const { termWidth, hasShortNames, remainder } = this.measureEntries(this.entries);
        let sectionBreakRequested = false;
        for (let entry of this.entries) {
            entry = this.convertEntry(entry, hasShortNames);
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

        writeln(out);

        function writeln(out: NodeJS.WritableStream, text = "") {
            if (sectionBreakRequested) {
                out.write(EOL);
                sectionBreakRequested = false;
            }

            out.write(text + EOL);
        }
    }

    private measureEntries(entries: ReadonlyArray<HelpEntry>): HelpMeasurements {
        let optionWidth = 0;
        let definitionTermWidth = 0;
        let commandNameWidth = 0;
        let hasShortNames = false;
        for (const entry of entries) {
            switch (entry.kind) {
                case "option": {
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

                        if (optionWidth < size) {
                            optionWidth = size;
                        }
                    }
                    break;
                }
                case "definition": {
                    if (entry.term.length > definitionTermWidth) definitionTermWidth = entry.term.length;
                    break;
                }
                case "command": {
                    if (entry.command.commandName.length > commandNameWidth) commandNameWidth = entry.command.commandName.length;
                }
            }
        }

        let termWidth = optionWidth;
        if (hasShortNames) termWidth += 4;
        if (definitionTermWidth > 0) termWidth = Math.max(termWidth, definitionTermWidth + 1);
        if (commandNameWidth > 0) termWidth = Math.max(termWidth, commandNameWidth + 1);
        const remainder = this.width - termWidth - this.padding;
        return { hasShortNames, termWidth, remainder };
    }

    private convertEntry(entry: HelpEntry, hasShortNames: boolean) {
        switch (entry.kind) {
            case "option": return this.convertOption(entry, hasShortNames);
            case "command": return this.convertCommand(entry);
            default: return entry;
        }
    }

    private convertOption(entry: HelpOption, hasShortNames: boolean): HelpDefinition {
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
        let definition = option.description || "";
        if (option.aliasFor) {
            if (definition) definition += " ";
            definition += this.color("[alias for: ", "note") + this.color(option.aliasFor.join(" "), "option") + this.color("]", "note");
        }
        return {
            kind: "definition",
            term,
            definition: this.format(definition, option.parentCommand, option, /*highlight*/ true)
        };
    }

    private convertCommand(entry: HelpCommand): HelpDefinition {
        const command = entry.command;
        let summary = command.summary;
        if (command.aliasFor) {
            const resolved = command.aliasFor.resolvedCommand;
            if (!summary) summary = resolved.summary;
            if (summary) summary += " ";
            const commandPath = this.color(command.aliasFor.commandPath.join(" "), "command");
            const commandArguments = command.aliasFor.commandArguments.join(" ");
            summary += `${this.color("[alias for:", "note")} $executable ${commandPath}${commandArguments ? " " + commandArguments : ""}${this.color("]", "note")}`;
        }
        return {
            kind: "definition",
            term: " " + this.color(command.commandName, "command"),
            definition: this.format(summary, command)
        };
    }

    private isVisible(object: { visibility: CommandLineVisibility }) {
        switch (object.visibility) {
            case "visible": return true;
            case "advanced": return this.level === "hidden" || this.level === "advanced";
            case "hidden": return this.level === "hidden";
            default: throw new RangeError("Invalid visibility");
        }
    }

    private switchTo(state: HelpWriterState) {
        if (this.state === undefined || this.state !== state) {
            if (this.state !== undefined) {
                this.addBreak();
            }
            this.state = state;
            this.lastCommand = undefined;
            this.lastOptionSet = undefined;
            return true;
        }

        return false;
    }

    private format(text: string, command?: Command, option?: Option, highlight?: boolean): string {
        if (command === undefined) command = this.command;

        const formatPattern = /(<\w+(?:\[\])?>)|(^|\b|\s|\[)(-(\w)\b|--(?:no[\-_])?([\w\-_]+)|(--))|\$([a-z]+)|\$\(([a-z]+(?:=([^)]*))?)\)|\${(.*?):(\w+)}|./gi;
        let lastFragment = "";
        let spaceRequested = "";

        function withRequestedSpace(text: string) {
            if (text === null || text === undefined) text = "";
            if (spaceRequested && text) {
                if (!/^[\s\r\n]/.test(text)) {
                    text = spaceRequested + text;
                }
                spaceRequested = "";
            }
            return text;
        }

        return text.replace(formatPattern, (_, param, space, parameterName, shortName, longName, passthru, name, parenName, fallback, text, color) => {
            if (space) {
                spaceRequested = space;
            }

            if (!name) name = parenName;

            if (param) {
                return lastFragment = withRequestedSpace(this.color(param, param === "<command>" ? "command" : "param"));
            }
            else if (shortName || longName) {
                const resolver: Resolver = this.command || this.commandLine;
                const option = longName ? resolver.fromLongName(longName) : shortName ? resolver.fromShortName(shortName) : undefined;
                if (option) {
                    return lastFragment = withRequestedSpace(this.color(parameterName, highlight ? "optionHighlight" : "option"));
                }
            }
            else if (passthru) {
                const resolver: Resolver = this.command || this.commandLine;
                if (resolver.getPassthruOption()) {
                    return lastFragment = withRequestedSpace(this.color(passthru, "passthru"));
                }
            }
            else if (name) {
                switch (name) {
                    case "executable":
                    case "executableName":
                        if (this.commandLine.name) {
                            return lastFragment = withRequestedSpace(this.color(this.commandLine.name, "executable"));
                        }
                        break;

                    case "help":
                        const helpCommand = this.commandLine.getHelpCommand();
                        if (helpCommand) {
                            return this.format("$commandPath", helpCommand);
                        }
                        break;

                    case "commandPath":
                        if (command) {
                            let current: Command | undefined = command;
                            let result = "";
                            while (current) {
                                if (result) result = " " + result;
                                result = this.color(current.commandName, "command") + result;
                                current = current.parentCommand;
                            }
                            return lastFragment = withRequestedSpace(result);
                        }
                        // falls through

                    case "command":
                    case "commandName":
                        if (command) {
                            return lastFragment = withRequestedSpace(this.color(command.commandName, "command"));
                        }
                        else if (option && option.parentCommand) {
                            return lastFragment = withRequestedSpace(this.color(option.parentCommand.commandName, "command"));
                        }
                        else {
                            return lastFragment = withRequestedSpace(this.color("<command>", "command"));
                        }

                    case "shortName":
                        if (option && option.shortName) {
                            return lastFragment = withRequestedSpace(this.color("-" + option.shortName, highlight ? "optionHighlight" : "option"));
                        }
                        break;

                    case "longName":
                        if (option && option.longName) {
                            return lastFragment = withRequestedSpace(this.color("--" + option.longName, highlight ? "optionHighlight" : "option"));
                        }
                        break;

                    case "parameterName":
                        if (option && option.longName) {
                            return lastFragment = withRequestedSpace(this.color("--" + option.longName, highlight ? "optionHighlight" : "option"));
                        }
                        if (option && option.shortName) {
                            return lastFragment = withRequestedSpace(this.color("-" + option.shortName, highlight ? "optionHighlight" : "option"));
                        }
                        break;

                    case "param":
                        if (option) {
                            return lastFragment = withRequestedSpace(this.color("<" + (option.param || option.type) + (option.multiple ? "[]>" : ">"), "param"));
                        }
                        break;

                    case "space":
                    case "s":
                        spaceRequested = !/^$|[\s\r\n]$/.test(lastFragment) ? " " : "";
                        return lastFragment = "";
                }
                if (fallback !== null && fallback !== undefined) {
                    return lastFragment = withRequestedSpace(this.format(fallback, command, option, highlight));
                }
            }
            else if (color) {
                return lastFragment = withRequestedSpace(this.color(this.format(text, command, option, highlight), color));
            }
            return lastFragment = withRequestedSpace(_);
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
    from(wordScan(text)).forEach(word => {
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