import { EOL } from "os";
import { assert, expect } from "chai";
import { theory } from "./utils";
import { CommandLineOption } from "../lib/types";
import { CommandLineResolver } from "../lib/resolver";
import { ParsedArgument, ParsedParameter, ParsedArgumentValue } from "../lib/parser";
import { Option } from "../lib/resolver";
import { bind, BoundArgument, BoundArgumentValue, BoundCommand } from "../lib/binder";

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
        "z": { },
        "w": {
            commands: { "v": { } }
        }
    }
});

describe("bind()", () => {
    let p: ParsedArgument[];
    theory("simple", [
        [p = [], []],
        [p = [parsed("-h", { shortName: "h" })], [bound(p[0], "help", { value: true })]],
        [p = [parsed("-a", { shortName: "a" })], [bound(p[0], "a", { value: true })]],
        [p = [parsed("--b", { longName: "b" }, { value: "c" })], [bound(p[0], "b", { value: "c" })]],
        [p = [parsed("--c", { longName: "c" }, { value: "123" })], [bound(p[0], "c", { value: 123 })]],
        [p = [parsed("--d", { longName: "d" }, { value: "e" })], [bound(p[0], "d", { value: "e" })]],
        [p = [parsed("--d", { longName: "d" }, { value: "e,f", values: ["e", "f"] })], [bound(p[0], "d", { value: "e,f" })]],
        [p = [parsed("--d", { longName: "d" }), arg("e,f", { value: "e,f", values: ["e", "f"] })], [bound(p[0], "d", { value: "e,f" })]],
        [p = [parsed("--d", { longName: "d" }), arg("e")], [bound(p[0], "d", { value: "e" })]],
        [p = [arg("z")], [], , command(p[0], "z")],
        [p = [arg("w"), arg("v")], [], , command(p[1], "v", command(p[0], "w"))],
        // [p = [arg("z"), arg("f")], [bound(p[0], "z", { value: true }), bound(p[1], "x", { value: "f" })]],
        [p = [parsed("--gab", { longName: "gab" }), parsed("--gbc", { longName: "gbc" })], [bound(p[0], "gab", { value: true }), bound(p[1], "gbc", { value: true })], ["b"]]
    ], (parsed, bound, groups, command) => {
        const result = bind(parsed, resolver);
        expect(result.boundArguments).to.deep.equal(bound);
        expect(result.groups).to.deep.equal(groups);
        expect(result.boundCommand).to.deep.equal(command);
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
        command: parent && parent.command ? parent.command.fromCommandName(key) : resolver.fromCommandName(key)
    };
}