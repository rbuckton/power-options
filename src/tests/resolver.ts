import { assert, expect } from "chai";
import { OptionResolver } from "../lib/resolver";

describe("OptionResolver", () => {
    it("default", () => {
        const resolver = new OptionResolver({ options: { } });
        assert.isUndefined(resolver.defaultGroup);
        assert.isUndefined(resolver.passthru);
        assert.isUndefined(resolver.rest);
        assert.deepEqual(resolver.groups, []);
        assert.isDefined(resolver.fromShortName("?"));
        assert.isDefined(resolver.fromShortName("h"));
        assert.isDefined(resolver.fromLongName("help"));
    });
});