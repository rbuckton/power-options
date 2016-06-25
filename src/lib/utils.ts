import * as path from "path";
import { CommandLineSettings } from "./options";

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