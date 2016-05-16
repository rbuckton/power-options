import { CommandLineOption, CommandLineParseError, CommandLineOptionMap } from "./options";

interface Map<T> { [key: string]: T; }

export interface CommandLineOptionProperty {
    key: string;
    option: CommandLineOption;
}

export class OptionResolver {
    public passthru: CommandLineOptionProperty;
    public rest: CommandLineOptionProperty;
    public defaultGroup: string;
    public groups: string[] = [];

    private keyMap: Map<CommandLineOption> = Object.create(null);
    private shortNameMap: Map<CommandLineOptionProperty> = Object.create(null);
    private longNameMap: Map<CommandLineOptionProperty> = Object.create(null);
    private positionMap: Map<CommandLineOptionProperty[]> = Object.create(null);
    private allOptions: CommandLineOptionProperty[] = [];
    private help: CommandLineOption;

    constructor(options: CommandLineOptionMap, defaultGroup?: string) {
        let help = false;
        // Add remaining options.
        for (const key of Object.keys(options)) {
            const option = options[key];
            this.addOption(key, option);
            if (option.help) {
                help = true;
            }
        }

        // Ensure a help option.
        if (!help) {
            this.addOption("help", this.help = { type: "boolean", shortName: "h", longName: "help", alias: ["?"], help: true });
        }

        if (defaultGroup) {
            this.defaultGroup = defaultGroup;
        }
    }

    public isGeneratedHelpOption(option: CommandLineOption) {
        return option === this.help;
    }

    public fromShortName(shortName: string) {
        return this.shortNameMap[shortName];
    }

    public fromLongName(longName: string) {
        return this.longNameMap[this.normalize(longName)];
    }

    public fromPosition(position: number) {
        return this.positionMap[position];
    }

    public has(key: string) {
        return key in this.keyMap;
    }

    public get(key: string) {
        return this.keyMap[key];
    }

    public getOptions(group?: string) {
        return this.allOptions
            .filter(({ option }) =>
                option.groups === undefined
                    || option.groups.length === 0
                    || (group && option.groups.indexOf(group) !== -1));
    }

    public getDefaultOptions(group?: string) {
        return this.getOptions(group)
            .filter(({ option }) => option.defaultValue !== undefined);
    }

    public getRequiredOptions(group?: string) {
        return this.getOptions(group)
            .filter(({ option }) => option.required);
    }

    private addOption(key: string, option: CommandLineOption) {
        if (typeof option !== "object" || option === null) {
            throw new TypeError(`Invalid CommandLineOption for key '${key}'.`);
        }

        switch (option.type) {
            case "boolean":
            case undefined:
                if (option.multiple) {
                    throw new Error(`Option '${key}' cannot be both multiple and type 'boolean'.`);
                }
                break;
        }

        this.keyMap[key] = option;

        const entry = { key, option };
        if (option.passthru) {
            if (this.passthru) {
                throw new Error(`Duplicate passthru option '${key}' conflicts with previous definition '${this.passthru.key}'`);
            }

            this.passthru = entry;
        }

        if (option.rest) {
            if (this.rest) {
                throw new Error(`Duplicate rest option '${key}' conflicts with previous definition '${this.rest.key}'.`);
            }

            this.rest = entry;
        }

        if (option.longName) {
            const longName = this.normalize(option.longName);
            if (this.longNameMap[longName]) {
                throw new Error(`Duplicate long name '${option.longName}' for option '${key}' conflicts with previous definition '${this.longNameMap[longName].key}'.`);
            }

            this.longNameMap[longName] = entry;
        }
        else {
            const longName = this.normalize(key);
            if (!this.longNameMap[longName]) {
                this.longNameMap[longName] = entry;
            }
        }

        if (option.shortName) {
            if (option.shortName.trim().length !== 1) {
                throw new Error(`Short name for option '${key}' must be a single non-whitespace character.`);
            }

            if (this.shortNameMap[option.shortName]) {
                throw new Error(`Duplicate short name '${option.shortName}' for option '${key}' conflicts with previous definition '${this.shortNameMap[option.shortName].key}'.`);
            }

            this.shortNameMap[option.shortName] = entry;
        }

        if (option.alias) {
            for (const alias of option.alias) {
                if (alias.trim().length === 0) {
                    throw new Error(`Alias for option '${key}' must be one or more characters.`);
                }

                if (alias.length === 1) {
                    if (this.shortNameMap[alias]) {
                        throw new Error(`Duplicate alias '${alias}' for option '${key}' conflicts with previous definition '${this.shortNameMap[alias].key}'.`);
                    }

                    this.shortNameMap[alias] = entry;
                }
                else {
                    const longName = this.normalize(alias);
                    if (this.longNameMap[longName]) {
                        throw new Error(`Duplicate alias '${alias}' for option '${key}' conflicts with previous definition '${this.longNameMap[longName].key}'.`);
                    }

                    this.longNameMap[longName] = entry;
                }
            }
        }

        if (option.position !== undefined) {
            const options = this.positionMap[option.position] || (this.positionMap[option.position] = []);
            if (!option.groups || option.groups.length === 0) {
                for (const existingOption of options) {
                    throw new Error(`Option '${key}' specifies the same position as option '${existingOption.key}'.`);
                }
            }
            else {
                for (const existingOption of options) {
                    if (existingOption.option.groups && existingOption.option.groups.length > 0) {
                        const existingGroups = new Set(existingOption.option.groups);
                        const intersection: string[] = [];
                        for (const group of option.groups) {
                            if (existingGroups.has(group)) {
                                intersection.push(group);
                            }
                        }
                        if (intersection) {
                            throw new Error(`Option '${key}' specifies the same position as option '${existingOption.key}' in group${intersection.length > 1 ? "s" : ""} ${intersection.map(s => `"${s}"`).join(", ")}.`);
                        }
                    }
                    else {
                        throw new Error(`Option '${key}' specifies the same position as option '${existingOption.key}'.`);
                    }
                }
            }

            options.push(entry);
        }

        if (option.groups) {
            for (const group in option.groups) {
                if (this.groups.indexOf(group) === -1) {
                    this.groups.push(group);
                }
            }
        }

        this.allOptions.push(entry);
    }

    private normalize(name: string) {
        return name
            .trim()
            .toLocaleLowerCase()
            .replace(/_/g, "-");
    }
}
