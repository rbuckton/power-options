import * as path from "path";
import * as tty from "tty";
import { EOL } from "os";
import { CommandLineSettings, CommandLineOption } from "./options";
import { OptionResolver } from "./resolver";

const whitespacePattern = /^\s$/;

interface PackageDetails {
    name: string;
    description: string;
    version: string;
}

export function printError(settings: CommandLineSettings, error: string, err?: NodeJS.WritableStream) {
    if (err === undefined) err = settings.stderr || process.stderr;
    err.write(`abort: ${error}` + EOL);
}

export function printHelp(settings: CommandLineSettings, resolver?: OptionResolver, out?: NodeJS.WritableStream) {
    if (resolver === undefined) resolver = new OptionResolver(settings);
    if (out === undefined) out = settings.stdout || process.stdout;

    const width = (<tty.WriteStream>out).isTTY ? (<tty.WriteStream>out).columns : 120;
    const writer = new HelpBuilder({ width });
    const details = getPackageDetails(settings);
    const options = resolver.getOptions("*")
        .filter(isVisibleOption)
        .sort(compareOptions);

    if (settings.usage) {
        const usage = Array.isArray(settings.usage) ? settings.usage : [settings.usage];
        if (usage.length > 0) {
            for (let i = 0; i < usage.length; i++) {
                writer.addDefinition(i === 0 ? "usage:" : "", usage[i]);
            }

            writer.addBreak();
        }
    }

    if (details.description) {
        writer.addLine(details.description);
        writer.addBreak();
    }

    if (options.length) {
        writer.addLine("options:");
        for (const { key, option } of options) {
            writer.addOption({
                shortName: option.shortName,
                longName: option.longName || (option.passthru ? undefined : key),
                param: option.param,
                passthru: option.passthru,
                description: option.description
            });
        }

        writer.addBreak();
    }

    if (settings.example) {
        const examples = Array.isArray(settings.example) ? settings.example : [settings.example];
        if (examples.length) {
            writer.addLine(examples.length === 1 ? "example:" : "examples:");
            for (const example of examples) {
                writer.addLine();
                writer.addLine(example);
            }
        }

        writer.addBreak();
    }

    writer.write(out);
}

function compareOptions(x: CommandLineOption, y: CommandLineOption) {
    let result = compareValues(x.position, y.position);
    if (result !== 0) return result;
    const x1 = (x.shortName || "") + (x.shortName && x.longName ? " " : "") + (x.longName || "");
    const y1 = (y.shortName || "") + (y.shortName && y.longName ? " " : "") + (y.longName || "");
    return x1 < y1 ? -1 : x1 > y1 ? +1 : 0;
}

function compareValues(x: any, y: any) {
    if (x === undefined && y === undefined) return 0;
    if (x === undefined) return +1;
    if (y === undefined) return -1;
    return x < y ? -1 : x > y ? +1 : 0;
}

function isVisibleOption(option: CommandLineOption) {
    return !option.hidden;
}

function getPackageDetails(settings: CommandLineSettings) {
    let { name, description, version } = settings;
    if (!name || !description || !version) {
        const json = typeof settings.package === "string"
            ? readPackage(settings.package)
            : settings.package === true
                ? findPackage()
                : undefined;
        if (json) {
            if (!name) name = json.name;
            if (!description) description = json.description;
            if (!version) version = json.version;
        }
    }
    return { name, description, version };
}

function readPackage(file: string) {
    if (!file) {
        return undefined;
    }

    if (require.main) {
        try {
            return require.main.require(file);
        }
        catch (e) {
            return undefined;
        }
    }

    return undefined;
}

function findPackage() {
    if (require.main) {
        const json = readPackage("./package.json");
        if (json) {
            return json;
        }

        if (require.main.filename) {
            let dirname = path.dirname(require.main.filename);
            let lastdir: string = undefined;
            while (dirname && dirname !== lastdir) {
                const json = readPackage(path.join(dirname, "package.json"));
                if (json) {
                    return json;
                }

                dirname = path.dirname(lastdir = dirname);
            }
        }
    }

    return undefined;
}

interface HelpWriterOptions {
    padding?: number;
    width?: number;
}

interface HelpOption {
    shortName?: string;
    longName?: string;
    passthru?: boolean;
    param?: string;
    description?: string;
}

interface HelpDefinition {
    term: string;
    definition: string;
}

interface HelpLine {
    text?: string;
    definition?: HelpDefinition;
    option?: CommandLineOption;
    sectionBreak?: boolean;
}

class HelpBuilder {
    private padding: number;
    private width: number;
    private printShortNames: boolean;
    private lines: HelpLine[] = [];

    constructor(options?: HelpWriterOptions) {
        this.padding = options && typeof options.padding === "number" ? options.padding : 1;
        this.width = options && typeof options.width === "number" ? options.width : 120;
        if (this.width > 160) {
            this.width = 160;
        }
    }

    public addOption(option: HelpOption) {
        this.lines.push({ option });
    }

    public addDefinition(term: string, definition: string) {
        this.lines.push({ definition: { term, definition }});
    }

    public addLine(text?: string) {
        this.lines.push({ text });
    }

    public addBreak() {
        if (this.lines.length > 0) {
            this.lines[this.lines.length - 1].sectionBreak = true;
        }
    }

    public write(out: NodeJS.WritableStream) {
        // compute term width
        let termWidth = 0;
        let hasShortNames = false;
        for (const line of this.lines) {
            const option = line.option;
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
                        size += option.param.length + 1;
                    }
                }

                if (termWidth < size) {
                    termWidth = size;
                }

                continue;
            }
        }

        if (hasShortNames) {
            termWidth += 4;
        }

        for (const line of this.lines) {
            const definition = line.definition;
            if (definition) {
                const size = definition.term.length + 1;
                if (termWidth < size) {
                    termWidth = size;
                }

                continue;
            }
        }

        // write each line
        const remainder = this.width - termWidth - this.padding;
        let sectionBreakRequested = false;
        for (const line of this.lines) {
            let text: string;
            let definition: HelpDefinition;
            const option = line.option;
            if (option) {
                let term = " ";
                if (option.passthru) {
                    term += `--`;
                }
                else {
                    if (option.shortName) {
                        term += `-${option.shortName}`;
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
                        term += `--${option.longName}`;
                        if (option.param) {
                            term += ` `;
                        }
                    }

                    if (option.param) {
                        term += option.param;
                    }
                }

                definition = { term, definition: option.description };
            }
            else {
                definition = line.definition;
            }

            if (definition) {
                const termLines = definition.term ? wordWrap(definition.term, termWidth) : [];
                const definitionLines = definition.definition ? wordWrap(definition.definition, remainder) : [];
                const lineCount = Math.max(termLines.length, definitionLines.length);
                for (let i = 0; i < lineCount; ++i) {
                    let line = "";
                    if (i < termLines.length) {
                        line += termLines[i];
                    }
                    if (i < definitionLines.length) {
                        line = padRight(line, termWidth + this.padding);
                        line += definitionLines[i];
                    }

                    writeln(out, line);
                }
            }
            else {
                const lines = wordWrap(line.text, this.width);
                for (const line of lines) {
                    writeln(out, line);
                }
            }

            if (line.sectionBreak) {
                sectionBreakRequested = line.sectionBreak;
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
}

function padLeft(text: string, size: number, char: string = " ") {
    while (text.length < size) text = char + text;
    return text;
}

function padRight(text: string, size: number, char: string = " ") {
    while (text.length < size) text += char;
    return text;
}

function printErrors(messages: string[]) {
    for (let message of messages) {
        console.error(message);
    }
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
            const fullWidth = word.end - word.pos;
            if (line.length > 0 && line.length + fullWidth > width) {
                if (line || lines.length) lines.push(line);
                line = text.substring(word.start, word.end);
            }
            else {
                line += text.substring(word.pos, word.end);
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