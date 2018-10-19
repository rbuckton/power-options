import * as path from "path";
import { CommandLineSettings, CommandLineParseError, CommandLineParseErrorDefinition, CommandLineAlias, CommandPath } from "./types";
import { Resolver, Command } from "./resolver";

/** @internal */
export interface PackageDetails {
    name: string | undefined;
    description: string | undefined;
    version: string | undefined;
}

/** @internal */
export function compareValues<T>(x: T | undefined, y: T | undefined) {
    if (x === undefined && y === undefined) return 0;
    if (x === undefined) return +1;
    if (y === undefined) return -1;
    return x < y ? -1 : x > y ? +1 : 0;
}

/** @internal */
export function getPackageDetails(settings: CommandLineSettings): PackageDetails {
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
            let lastdir: string | undefined = undefined;
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

/** @internal */
export function isCommandLineParseErrorDefinition(value: any): value is CommandLineParseErrorDefinition {
    if (value instanceof CommandLineParseError) return true;
    return value !== null
        && typeof value === "object"
        && typeof value.message === "string"
        && (typeof value.help === "boolean" || value.help === undefined)
        && (typeof value.status === "number" || value.status === undefined);
}

/** @internal */
export function toCommandLineParseError(e: any) {
    if (e instanceof CommandLineParseError) {
        return e;
    }
    else if (e instanceof Error) {
        return new CommandLineParseError(e.message);
    }
    else if (isCommandLineParseErrorDefinition(e)) {
        return new CommandLineParseError(e.message, e.help, e.status);
    }
    else {
        return new CommandLineParseError(String(e));
    }
}

/** @internal */
export function isObjectLike(value: any): boolean {
    if (value === null) return false;
    return typeof value === "object" || typeof value === "function";
}

/** @internal */
export type WalkResult =
    | { found: true, resolver: Resolver, command: Command }
    | { found: false, resolver: Resolver, commandName: string }

/** @internal */
export function walkCommandPath(resolver: Resolver, commandPath: ReadonlyArray<string>, resolveAliases: boolean = false): WalkResult {
    if (commandPath.length === 0) throw new Error("Invalid command path");
    let command: Command | undefined;
    let commandName: string | undefined;
    let commandNames = commandPath.slice();
    while (commandName = commandNames.shift()) {
        const result = resolver.getCommand(commandName);
        if (!result) {
            command = undefined;
            break;
        }
        if (resolveAliases && result.aliasFor) {
            commandNames = [
                ...result.aliasFor.commandPath,
                ...commandNames
            ];
            continue;
        }
        resolver = command = result;
    }
    return command === undefined
        ? { found: false, resolver, commandName: commandName! }
        : { found: true, resolver, command };
}

/** @internal */ export function valuesOrDefault<T>(values: T[] | T | undefined, copy?: boolean): T[];
/** @internal */ export function valuesOrDefault<T>(values: ReadonlyArray<T> | T | undefined, copy?: false): ReadonlyArray<T>;
/** @internal */ export function valuesOrDefault<T>(values: ReadonlyArray<T> | T | undefined, copy: true): T[];
/** @internal */ export function valuesOrDefault<T>(values: T[] | T | undefined, defaultValues?: T[]): T[];
/** @internal */ export function valuesOrDefault<T>(values: ReadonlyArray<T> | T | undefined, defaultValues?: ReadonlyArray<T>): ReadonlyArray<T>;
/** @internal */ export function valuesOrDefault<T>(values: T[] | T | undefined, defaultValues?: T[], copy?: boolean): T[];
/** @internal */ export function valuesOrDefault<T>(values: ReadonlyArray<T> | T | undefined, defaultValues?: ReadonlyArray<T>, copy?: false): ReadonlyArray<T>;
/** @internal */ export function valuesOrDefault<T>(values: ReadonlyArray<T> | T | undefined, defaultValues: T[] | undefined, copy: true): T[];
/** @internal */ export function valuesOrDefault<T>(values: ReadonlyArray<T> | T | undefined, defaultValues: ReadonlyArray<T> | undefined, copy: true): ReadonlyArray<T>;
/** @internal */ export function valuesOrDefault<T, U>(value: ReadonlyArray<T> | T | undefined, map: (value: T) => U): U[];
/** @internal */ export function valuesOrDefault<T, U>(value: ReadonlyArray<T> | T | undefined, defaultValues: U[] | undefined, map: (value: T) => U): U[];
/** @internal */ export function valuesOrDefault<T, U>(value: ReadonlyArray<T> | T | undefined, defaultValues: ReadonlyArray<U> | undefined, map: (value: T) => U): ReadonlyArray<U>;
/** @internal */ export function valuesOrDefault<T>(values: T[] | T | undefined, defaultValues?: ReadonlyArray<T> | ((value: T) => T) | boolean, map?: ((value: T) => T) | boolean): ReadonlyArray<T> | T[] {
    if (typeof defaultValues === "boolean" || typeof defaultValues === "function") map = defaultValues, defaultValues = undefined;
    return Array.isArray(values) ? typeof map === "function" ? values.map(map) : map === true ? values.slice() : values :
        values !== undefined ? [typeof map === "function" ? map(values) : values] :
        defaultValues !== undefined ? defaultValues :
        [];
}

/** @internal */ export function valueOrDefault<T>(value: T | undefined, defaultValue: T): T {
    return value !== undefined ? value : defaultValue;
}

/** @internal */
export function toCommandPath(command: string | CommandPath) {
    return typeof command === "string" ? [command] as CommandPath : command;
}

/** @internal */ export class Lazy<T> {
    private _value!: T;
    private _valueFactory: ((...args: any) => T) | undefined;
    private _valueFactoryArgs: any[] | undefined;

    constructor(valueFactory: () => T) {
        this._valueFactory = valueFactory;
        this._valueFactoryArgs = undefined;
    }

    static from<T, A extends any[]>(valueFactory: (...args: A) => T, ...args: A) {
        const lazy = new Lazy<T>(resolvingValueFactory);
        lazy._valueFactory = valueFactory;
        lazy._valueFactoryArgs = args;
        return lazy;
    }

    static of<T>(value: T) {
        const lazy = new Lazy<T>(resolvingValueFactory);
        lazy._value = value;
        lazy._valueFactory = undefined;
        return lazy;
    }

    get hasValue() {
        return this._valueFactory === undefined;
    }

    get value() {
        const valueFactory = this._valueFactory;
        const valueFactoryArgs = this._valueFactoryArgs;
        if (valueFactory === resolvingValueFactory) throw new Error("Value recursively references itself during its own initialization.");
        if (valueFactory) {
            let ok = false;
            try {
                this._valueFactory = resolvingValueFactory;
                this._valueFactoryArgs = undefined;
                this._value = valueFactoryArgs ? valueFactory(...valueFactoryArgs) : valueFactory();
                ok = true;
            }
            finally {
                if (ok) {
                    this._valueFactory = undefined;
                }
                else {
                    this._valueFactory = valueFactory;
                    this._valueFactoryArgs = valueFactoryArgs;
                }
            }
        }
        return this._value;
    }
}

function resolvingValueFactory(): any {}