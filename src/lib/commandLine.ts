import * as tty from "tty";
import * as net from "net";
import * as chalk from "chalk";
import { EOL } from "os";
import { PassThrough } from "stream";
import { Resolver, Command } from "./resolver";
import { parse } from "./parser";
import { bind } from "./binder";
import { evaluate } from "./evaluator";
import { getPackageDetails, walkCommandPath, toCommandPath } from "./utils";
import { HelpWriter } from "./printer";
import { CommandLineSettings, ParsedCommandLine, CommandLineExecCallback, CommandPath, HelpDetails } from "./types";

export function parseCommandLine<T>(args: string[], settings: CommandLineSettings): ParsedCommandLine<T> {
    return new CommandLine(settings).parse<T>(args);
}

export class CommandLine extends Resolver {
    public readonly settings: CommandLineSettings;
    public readonly name: string;
    public readonly description: string;
    public readonly version: string;
    public readonly usages: ReadonlyArray<string>;
    public readonly examples: ReadonlyArray<string>;
    public readonly stdout: NodeJS.WritableStream;
    public readonly stderr: NodeJS.WritableStream;
    public readonly auto: boolean | "print";
    public readonly color: boolean | "force";
    public readonly width: number | undefined;
    public readonly maxWidth: number | undefined;

    private _preExec: CommandLineExecCallback | undefined;
    private _exec: CommandLineExecCallback | undefined;
    private _postExec: CommandLineExecCallback | undefined;
    private _colorStdout: boolean;
    private _colorStderr: boolean;
    private _container: boolean;

    constructor(settings: CommandLineSettings) {
        super(settings);
        const { auto, usage, example, color, width, maxWidth, stdout, stderr, container = false } = settings;
        const { name, description, version } = getPackageDetails(settings);
        this.settings = settings;
        this.name = name || "";
        this.description = description || "";
        this.version = version || "";
        this.auto = auto || false;
        this.color = color || false;
        this.width = width;
        this.maxWidth = maxWidth;
        this.usages = Array.isArray(usage) ? usage.slice() : usage ? [usage] : [];
        this.examples = Array.isArray(example) ? example.slice() : example ? [example] : [];
        this.stdout = pickStream(stdout, process.stdout);
        this.stderr = pickStream(stderr, process.stderr);
        this._preExec = settings.preExec;
        this._exec = settings.exec;
        this._postExec = settings.postExec;
        this._colorStdout = color === "force" ? true : this.color && this.stdout instanceof tty.WriteStream;
        this._colorStderr = color === "force" ? true : this.color && this.stderr instanceof tty.WriteStream;
        this._container = container;
        super._ensureHelpOption();
        super._ensureHelpCommand();
    }

    public parse<T = any>(args: string[]): ParsedCommandLine<T> {
        const { parsedArguments } = parse(args);
        const { boundCommand, boundArguments, groups, resolver } = bind(parsedArguments, this);
        const parsed = evaluate<T>(boundCommand, boundArguments, groups, resolver);
        if (this.auto) {
            this._printResult(parsed);
        }
        if (parsed.handled && this.auto === true) {
            process.exit(parsed.status);
        }
        return parsed;
    }

    public async execute<T>(parsed: ParsedCommandLine<T>, context: any): Promise<void> {
        if (!parsed.handled && !parsed.error && !parsed.help) {
            const command = parsed.commandPath && this.findCommand(parsed.commandPath);
            if (command) {
                await command.execute(parsed, context);
            }
            else {
                await super.execute(parsed, context);
            }
            this._printResult(parsed);
        }
        if (parsed.handled && this.auto === true) {
            process.exit(parsed.status);
        }
    }

    public async parseAndExecute<T = any>(args: string[], context: any): Promise<ParsedCommandLine<T>> {
        const parsed = this.parse<T>(args);
        await this.execute(parsed, context);
        return parsed;
    }

    protected async _invokePreExec(parsed: ParsedCommandLine<any>, context: any) {
        if (!parsed.handled && this._preExec) {
            const preExec = this._preExec;
            await preExec.call(this.settings, parsed, context);
        }
    }

    protected async _invokeExec(parsed: ParsedCommandLine<any>, context: any) {
        if (!parsed.handled && this._exec) {
            const exec = this._exec;
            await exec.call(this.settings, parsed, context);
            parsed.handled = true;
        }
    }

    protected async _invokePostExec(parsed: ParsedCommandLine<any>, context: any) {
        if (parsed.handled && this._postExec) {
            const postExec = this._postExec;
            await postExec.call(this.settings, parsed, context);
        }
    }

    private _printResult<T>(result: ParsedCommandLine<T>) {
        if (this._container && !result.commandPath && !result.help) {
            result.help = true;
        }
        if (result.error || result.help) {
            if (result.error) this.printError(result.error);
            if (result.help) this.printHelp(result.commandPath, result.help === true ? HelpDetails.None : result.help);
            result.handled = true;
        }
    }

    public printError(error: string) {
        let message = `abort: ${error}${EOL}`;
        if (this._colorStderr) {
            message = chalk.bold.red(message);
        }

        this.stderr.write(message, "utf8");
    }

    public printHelp(details?: HelpDetails): void;
    public printHelp(commandPath?: string | CommandPath, details?: HelpDetails): void;
    public printHelp(commandPath?: string | CommandPath | HelpDetails, details?: HelpDetails) {
        if (typeof commandPath === "number") details = commandPath, commandPath = undefined;
        let resolver: Resolver = this;
        let command: Command | undefined;
        if (commandPath) {
            const result = walkCommandPath(this, toCommandPath(commandPath), true);
            if (!result.found) throw new Error (`Command '${result.commandName}' not found.`);
            command = result.command;
            resolver = result.resolver;
        }

        const width = this.width !== undefined ? this.width :
            this.stdout instanceof tty.WriteStream ? this.stdout.columns - 2 :
            undefined;

        const maxWidth = this.maxWidth !== undefined ? this.maxWidth :
            this.width !== undefined ? this.width :
            undefined;

        const writer = new HelpWriter(this, command, {
            width,
            maxWidth,
            color: this._colorStdout,
            level: details! & HelpDetails.Advanced ? "advanced" : "visible",
            examples: (details! & HelpDetails.Examples) === HelpDetails.Examples
        });

        const commands = resolver.getCommands();
        const generalOptions = this.getOwnOptions("*");
        writer.addUsages(command ? command.usages : this.usages);
        writer.addDefaultUsage();
        writer.addDescription(command ? command.description : this.description);
        writer.addCommands(commands);
        if (command) {
            for (const node of command.toHierarchy().ancestorsAndSelf()) {
                writer.addOptions(node.getOwnOptions("*"));
            }
        }
        writer.addOptions(generalOptions);
        writer.addExamples(command ? command.examples : this.examples);
        writer.write(this.stdout);
    }
}

function pickStream(stdio: "inherit" | "pipe" | number | NodeJS.WritableStream | undefined, inherit: NodeJS.WritableStream) {
    if (typeof stdio === "string" || stdio === undefined) {
        switch (stdio) {
            case "pipe": return new PassThrough({ encoding: "utf8" });
            default: return inherit;
        }
    }
    else if (typeof stdio === "number") {
        return new net.Socket({ fd: stdio, writable: true } as any);
    }
    else {
        return stdio;
    }
}