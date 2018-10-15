import { EOL } from "os";
import { assert, expect } from "chai";
import { theory } from "./utils";
import { CommandLineResolver } from "../lib/resolver";
import { ParsedArgument, ParsedParameter, ParsedArgumentValue } from "../lib/parser";
import { Option } from "../lib/resolver";
import { evaluate } from "../lib/evaluator";
import { BoundArgument, BoundArgumentValue, BoundCommand } from "../lib/binder";
import { ParsedCommandLine } from "../lib/types";

const resolver = new CommandLineResolver({
    options: {
        "a": { shortName: "a" },
        "b": { type: "string" },
        "c": { type: "number" },
        "d": { type: "string", multiple: true },
        "x": { type: "string", position: 0 },
        "gab": { type: "boolean", group: ["a", "b"] },
        "gbc": { type: "boolean", group: ["b", "c"] }
    },
    commands: {
        "z": { }
    }
});

describe("evaluate()", () => {
    let p: ParsedArgument[];
    theory("simple", [
        [[], , , result({ options: {} })],
        [[bound(parsed("-h", { shortName: "h" }), "help", { value: true })], , , result({ options: { help: true }, help: true })],
        [[bound(parsed("-a", { shortName: "a" }), "a", { value: true })], , , result({ options: { a: true }})],
        [[bound(parsed("--b", { longName: "b" }, { value: "c" }), "b", { value: "c" })], , , result({ options: { b: "c" }})],
        [[bound(parsed("--c", { longName: "c" }, { value: "123" }), "c", { value: 123 })], , , result({ options: { c: 123 }})],
        [[bound(parsed("--d", { longName: "d" }, { value: "e" }), "d", { value: "e" })], , , result({ options: { d: ["e"] }})],
        [[bound(parsed("--d", { longName: "d" }, { values: ["e", "f"] }), "d", { values: ["e", "f"] })], , , result({ options: { d: ["e", "f"] }})],
        [[], , command(arg("z"), "z"), result({ options: {}, commandName: "z" })],
        [[bound(parsed("--gab", { longName: "gab"}), "gab", { value: true }), bound(parsed("--gbc", { longName: "gbc"}), "gbc", { value: true })], ["b"], , result({ options: { gab: true, gbc: true }, group: "b" })]
    ], (bound, groups, command, expected) => {
        const result = evaluate(command, bound, groups, resolver);
        expect(result).to.deep.equal(expected);
    });
});

function parsed(text: string, parameter: any, argument?: ParsedArgumentValue): ParsedArgument {
    return Object.assign({
        text,
        parameter: parameter && Object.assign(<ParsedParameter>{
            parameterName: undefined,
            shortName: undefined,
            longName: undefined,
            passthru: false,
            no: false
        }, parameter),
        argument
    });
}

function arg(text: string, argument?: ParsedArgumentValue) {
    return parsed(text, /*parameter*/ undefined, argument || { value: text });
}

function bound(parsed: ParsedArgument, key: string, argument: BoundArgumentValue): BoundArgument {
    return {
        parsed,
        option: resolver.get(key),
        argument,
        error: undefined
    };
}

function command(parsed: ParsedArgument, key: string, parent?: BoundCommand): BoundCommand {
    return {
        parent,
        parsed,
        command: resolver.fromCommandName(key)
    };
}

function result<T>({ options, commandName, commandPath, group, help, status = 0, error }: ParsedCommandLine<T>): ParsedCommandLine<T> {
    return {
        options,
        command: commandName ? resolver.fromCommandName(commandName).command : undefined,
        commandName,
        commandPath: commandPath ? commandPath : commandName ? [commandName] : undefined,
        group,
        help,
        status,
        error
    };
}