import { assert, expect } from "chai";
import { CommandLineResolver } from "../lib/resolver";

describe("OptionResolver", () => {
    it("default", () => {
        const resolver = new CommandLineResolver({ options: { } });
        assert.isUndefined(resolver.getDefaultGroup());
        assert.isUndefined(resolver.getPassthru());
        assert.isUndefined(resolver.getRest());
        assert.deepEqual(resolver.groups, []);
        assert.isDefined(resolver.fromShortName("?"));
        assert.isDefined(resolver.fromShortName("h"));
        assert.isDefined(resolver.fromLongName("help"));
    });
});