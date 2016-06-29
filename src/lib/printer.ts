import * as path from "path";
import * as tty from "tty";
import * as chalk from "chalk";
import { EOL } from "os";
import { Command, Option } from "./resolver";
import { CommandLine } from "./options";

declare module "chalk" {
    interface ChalkStyleMap { [key: string]: ChalkStyleElement; }
    interface ChalkStyle { [key: string]: ChalkChain; }
}

const whitespacePattern = /^\s$/;

export interface HelpWriterOptions {
    padding?: number;
    width?: number;
    color?: boolean;
    textColor?: string | chalk.ChalkChain;
    executableColor?: string | chalk.ChalkChain;
    headerColor?: string | chalk.ChalkChain;
    commandColor?: string | chalk.ChalkChain;
    optionColor?: string | chalk.ChalkChain;
    passthruColor?: string | chalk.ChalkChain;
    paramColor?: string | chalk.ChalkChain;
    exampleColor?: string | chalk.ChalkChain;
    usageColor?: string | chalk.ChalkChain;
    descriptionColor?: string | chalk.ChalkChain;
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

export class HelpWriter {
    private commandLine: CommandLine;
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
    private executableColor?: string | chalk.ChalkChain;
    private textColor?: string | chalk.ChalkChain;
    private headerColor?: string | chalk.ChalkChain;
    private commandColor?: string | chalk.ChalkChain;
    private passthruColor?: string | chalk.ChalkChain;
    private optionColor?: string | chalk.ChalkChain;
    private paramColor?: string | chalk.ChalkChain;
    private exampleColor?: string | chalk.ChalkChain;
    private usageColor?: string | chalk.ChalkChain;
    private descriptionColor?: string | chalk.ChalkChain;

    constructor(commandLine: CommandLine, command: Command | undefined, options: HelpWriterOptions = {}) {
        const { padding = 1, width = 120, color = false } = options || {} as HelpWriterOptions;
        this.commandLine = commandLine;
        this.command = command;
        this.hasWrittenCommand = command ? true : false;
        this.padding = padding;
        this.width = Math.min(160, width);
        this.useColors = color;
        this.textColor = options.textColor;
        this.executableColor = options.executableColor || chalk.yellow.bold;
        this.headerColor = options.headerColor || chalk.white.bold;
        this.commandColor = options.commandColor || chalk.cyan.bold;
        this.passthruColor = options.passthruColor || chalk.gray;
        this.optionColor = options.optionColor;
        this.paramColor = options.paramColor || chalk.gray;
        this.exampleColor = options.exampleColor || chalk.gray;
        this.usageColor = options.usageColor;
        this.descriptionColor = options.descriptionColor;
    }

    public addUsages(usages: Iterable<string>) {
        for (const usage of usages) {
            this.addUsage(usage);
        }
    }

    public addUsage(usage: string) {
        if (usage) {
            const prefix = this.switchTo(HelpWriterState.Usage) ? "usage: " : "      ";
            this.addRawText(this.color(prefix, "header") + this.color(this.format(usage), "usage"));
        }
    }

    public addDefaultUsage(hasCommands: boolean, hasOptions: boolean) {
        if (this.state !== HelpWriterState.Usage) {
            const usage: string[] = [this.color(this.commandLine.name, "executable")];
            if (hasCommands) usage.push(this.format("${commandName}"));
            if (hasOptions) usage.push(this.color("[options]", "option"));
            this.addUsage(usage.join(" "));
        }
    }

    public addExamples(examples: Iterable<string>) {
        for (const example of examples) {
            this.addExample(example);
        }
    }

    public addExample(example: string) {
        if (example) {
            if (this.switchTo(HelpWriterState.Examples)) {
                this.examplesHeader = this.addRawText(this.color("example:", "header"));
            }
            else if (this.examplesHeader) {
                this.examplesHeader.text = this.color("examples:", "header");
            }

            this.addRawText(EOL + this.color(this.format(example), "example"), 1);
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
        if (command) {
            if (this.switchTo(HelpWriterState.Commands)) {
                this.addRawText(this.color("commands:", "header"));
                this.hasWrittenCommand = true;
            }

            this.entries.push({ kind: "command", command });
        }
    }

    public addOptions(options: Iterable<Option>) {
        for (const option of options) {
            this.addOption(option);
        }
    }

    public addOption(option: Option) {
        if (option) {
            const command = option.command;
            if (this.switchTo(HelpWriterState.Options) || this.lastCommand !== command) {
                this.lastCommand = command;
                this.addBreak();
                if (command) {
                    this.addRawText(this.color(`'${this.color(command.commandName, "command")}' options:`, "header"));
                    this.hasWrittenCommandOption = true;
                }
                else if (this.hasWrittenCommandOption || this.hasWrittenCommand) {
                    this.addRawText(this.color("general options:", "header"));
                }
                else {
                    this.addRawText(this.color("options:", "header"));
                }
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
                        size += 4;
                    }
                    else {
                        if (option.shortName) {
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
                        term += this.color(`--`, "passthru");
                    }
                    else {
                        if (option.shortName) {
                            term += this.color(`-${option.shortName}`, "option");
                            if (option.longName) {
                                term += `, `;
                            }
                            else if (option.param) {
                                term += ` `;
                            }
                        }
                        else if (hasShortNames) {
                            term += `    `;
                        }

                        if (option.longName) {
                            term += this.color(`--${option.longName}`, "option");
                            if (option.param) {
                                term += ` `;
                            }
                        }

                        if (option.param) {
                            term += this.color(`<${option.param}${option.multiple ? "[]" : ""}>`, "param");
                        }
                    }

                    entry = { kind: "definition", term, definition: this.format(option.description || "", option.command, option) };
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

    private format(text: string, command?: Command, option?: Option) {
        if (command === undefined) command = this.command;

        const formatPattern = /(<\w+>)|\${(?:(-?\w+)|"([^"]+)")(?::([^}]+))?}/g;
        return text.replace(formatPattern, (_, param, name, text, color) => {
            if (param) {
                return this.color(param, param === "<command>" ? "command" : "param");
            }

            let result = "";
            if (name) {
                switch (name) {
                    case "executableName":
                        if (this.commandLine.name) {
                            return this.color(this.commandLine.name, color || "executable");
                        }
                        break;

                    case "commandName":
                        if (command) {
                            return this.color(command.commandName, color || "command");
                        }
                        else if (option && option.command) {
                            return this.color(option.command.commandName, color || "command");
                        }
                        else {
                            return this.color("<command>", color || "command");
                        }

                    case "shortName":
                        if (option && option.shortName) {
                            return this.color("-" + option.shortName, color || "option");
                        }
                        break;

                    case "longName":
                        if (option && option.longName) {
                            return this.color("--" + option.longName, color || "option");
                        }
                        break;

                    case "parameterName":
                        if (option && option.longName) {
                            return this.color("--" + option.longName, color || "option");
                        }
                        if (option && option.shortName) {
                            return this.color("-" + option.shortName, color || "option");
                        }
                        break;

                    case "param":
                        if (option && option.param) {
                            return this.color("<" + option.param + ">", color || "param");
                        }
                        break;
                }
            }
            else if (text) {
                result = text;
            }

            if (color) {
                this.color(result, color);
            }

            return result;
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
            case "text": return this.textColor;
            case "executable": return this.executableColor;
            case "header": return this.headerColor;
            case "command": return this.commandColor;
            case "option": return this.optionColor;
            case "passthru": return this.passthruColor;
            case "param": return this.paramColor;
            case "example": return this.exampleColor;
            case "usage": return this.usageColor;
            case "description": return this.descriptionColor;
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
                return undefined;
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
    for (const word of wordScan(text)) {
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
    }

    if (line) {
        lines.push(line);
    }

    return lines;
}

function* wordScan(text: string): Iterable<TextRange> {
    let end = 0;
    let pos = 0;
    while (end < text.length) {
        const ch = text.charAt(end);
        if (ch === '\r') {
            const start = end;
            end++;
            if (end < text.length && text.charAt(end) === '\n') {
                end++;
            }

            yield { pos, start, end, newLine: true };
            pos = end;
        }
        else if (ch === '\n') {
            const start = end;
            end++;
            yield { pos, start, end, newLine: true  };
            pos = end;
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

            yield { pos, start, end };
            pos = end;
        }
        else {
            end++;
        }
    }
}