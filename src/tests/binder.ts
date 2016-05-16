import { EOL } from "os";
import { assert, expect } from "chai";
import { theory } from "./utils";
import { CommandLineOption } from "../lib/options";
import { OptionResolver } from "../lib/resolver";
import { ParsedArgument, ParsedParameter, ParsedArgumentValue } from "../lib/parser";
import { bind, BoundArgument, BoundArgumentValue } from "../lib/binder";

const resolver = new OptionResolver({
    "a": { shortName: "a" },
    "b": { type: "string" },
    "c": { type: "number" },
    "d": { type: "string", multiple: true },
    "x": { type: "string", position: 0 },
    "gab": { type: "boolean", groups: ["a", "b"] },
    "gbc": { type: "boolean", groups: ["b", "c"] }
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
        [p = [parsed("--d", { longName: "d" }, { value: "e,f", values: ["e", "f"] })], [bound(p[0], "d", { value: "e,f", values: ["e", "f"] })]],
        [p = [parsed("--d", { longName: "d" }), arg("e,f", { value: "e,f", values: ["e", "f"] })], [bound(p[0], "d", { value: "e,f", values: ["e", "f"] })]],
        [p = [parsed("--d", { longName: "d" }), arg("e")], [bound(p[0], "d", { value: "e" })]],
        [p = [arg("f")], [bound(p[0], "x", { value: "f" })]],
        [p = [parsed("--gab", { longName: "gab" }), parsed("--gbc", { longName: "gbc" })], [bound(p[0], "gab", { value: true }), bound(p[1], "gbc", { value: true })], ["b"]]
    ], (parsed, bound, groups) => {
        expect(bind(parsed, resolver)).to.deep.equal({ boundArguments: bound, groups });
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
        key,
        option: key && resolver.get(key),
        argument,
        error: undefined
    };
}
