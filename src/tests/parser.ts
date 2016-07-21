import { EOL } from "os";
import { assert, expect } from "chai";
import { theory } from "./utils";
import { parse, ParsedParameter, ParsedArgument, ParsedArgumentValue } from "../../out/lib/parser";

const host = {
    readFileSync(file: string) {
        switch (file) {
            case "simple.rsp":
                return [
                    "-a"
                ].join(EOL);
        }
    }
}

describe("Parser", () => {
    theory("parse()", [
        [[]],
        [["-a"], param("-a", { parameterName: "-a", shortName: "a" })],
        [["/a"], param("/a", { parameterName: "/a", shortName: "a" })],
        [["--a"], param("--a", { parameterName: "--a", longName: "a" })],
        [["--"], param("--", { parameterName: "--", passthru: true }, { values: [] })],
        [["--", "-a", "--b"], param("--", { parameterName: "--", passthru: true }, { values: ["-a", "--b"] })],
        [["--no-a"], param("--no-a", { parameterName: "--no-a", longName: "a", no: true })],
        [["-a:b"], param("-a:b", { parameterName: "-a", shortName: "a" }, { value: "b" })],
        [["-a=b"], param("-a=b", { parameterName: "-a", shortName: "a" }, { value: "b" })],
        [["/a:b"], param("/a:b", { parameterName: "/a", shortName: "a" }, { value: "b" })],
        [["/a=b"], param("/a=b", { parameterName: "/a", shortName: "a" }, { value: "b" })],
        [["--a:b"], param("--a:b", { parameterName: "--a", longName: "a" }, { value: "b" })],
        [["--a=b"], param("--a=b", { parameterName: "--a", longName: "a" }, { value: "b" })],
        [["--no-a:b"], param("--no-a:b", { parameterName: "--no-a", longName: "a", no: true }, { value: "b" })],
        [["--no-a=b"], param("--no-a=b", { parameterName: "--no-a", longName: "a", no: true }, { value: "b" })],
        [["-a:", "b"], param("-a:", { parameterName: "-a", shortName: "a" }, { value: "b" })],
        [["-a=", "b"], param("-a=", { parameterName: "-a", shortName: "a" }, { value: "b" })],
        [["/a:", "b"], param("/a:", { parameterName: "/a", shortName: "a" }, { value: "b" })],
        [["/a=", "b"], param("/a=", { parameterName: "/a", shortName: "a" }, { value: "b" })],
        [["--a:", "b"], param("--a:", { parameterName: "--a", longName: "a" }, { value: "b" })],
        [["--a=", "b"], param("--a=", { parameterName: "--a", longName: "a" }, { value: "b" })],
        [["-a:b,c"], param("-a:b,c", { parameterName: "-a", shortName: "a" }, { value: "b,c", values: ["b", "c"] })],
        [["-a:b, c"], param("-a:b, c", { parameterName: "-a", shortName: "a" }, { value: "b, c", values: ["b", "c"] })],
        [["-a:b,", "c"], param("-a:b,", { parameterName: "-a", shortName: "a" }, { value: "b, c", values: ["b", "c"] })],
        [["@simple.rsp"], param("-a", { parameterName: "-a", shortName: "a" })],
        [["a"], arg("a", { value: "a" })],
        [["a", "b"], arg("a", { value: "a" }), arg("b", { value: "b" })],
        [["a", "b,", "c"], arg("a", { value: "a" }), arg("b,", { value: "b, c", values: ["b", "c"] })],
    ], (args, ...expected) => {
        expect(parse(args, host).parsedArguments).to.deep.equal(expected);
    });
});

function param(text: string, parameter: any, argument?: ParsedArgumentValue): ParsedArgument {
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
    return param(text, /*parameter*/ undefined, argument);
}