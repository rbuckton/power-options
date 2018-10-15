import * as path from "path";
import * as tty from "tty";
import * as fs from "fs";
import { CommandLineSettings, CommandLineParseError, CommandLineParseErrorDefinition } from "./types";
import { Stream } from "stream";

export interface PackageDetails {
    name: string | undefined;
    description: string | undefined;
    version: string | undefined;
}

export function compareValues<T>(x: T | undefined, y: T | undefined) {
    if (x === undefined && y === undefined) return 0;
    if (x === undefined) return +1;
    if (y === undefined) return -1;
    return x < y ? -1 : x > y ? +1 : 0;
}

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

export function isCommandLineParseErrorDefinition(value: any): value is CommandLineParseErrorDefinition {
    if (value instanceof CommandLineParseError) return true;
    return value !== null
        && typeof value === "object"
        && typeof value.message === "string"
        && (typeof value.help === "boolean" || value.help === undefined)
        && (typeof value.status === "number" || value.status === undefined);
}

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

export function isObjectLike(value: any): boolean {
    if (value === null) return false;
    return typeof value === "object" || typeof value === "function";
}
