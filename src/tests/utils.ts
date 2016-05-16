import { assert, expect } from "chai";

export function theory(name: string, data: any[][], cb: (...args: any[]) => void) {
    for (const entry of data) {
        it(`${name}[${entry.map(value => typeof value === "function" ? value.name : JSON.stringify(value)).join(", ")}]`, () => cb.apply(undefined, entry));
    }
}
