import { assert, expect } from "chai";
import { CommandLine } from "../lib/commandLine";

describe("OptionResolver", () => {
    it("default", () => {
        const resolver = new CommandLine({ options: { } });
        assert.isUndefined(resolver.getDefaultGroup());
        assert.isUndefined(resolver.getPassthruOption());
        assert.isUndefined(resolver.getRestOption());
        assert.isDefined(resolver.getHelpOption());
        assert.deepEqual(resolver.groups, []);
        assert.isDefined(resolver.fromShortName("?"));
        assert.isDefined(resolver.fromShortName("h"));
        assert.isDefined(resolver.fromLongName("help"));
    });
});