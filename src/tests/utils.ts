import { assert, expect } from "chai";
export function theory(name: string, data: any[][], cb: (...args: any[]) => void) {
    const numTheories = data.length;
    for (let i = 0; i < numTheories; i++) {
        const entry = data[i];
        it(`${name} #${i} [ ${formatTheoryArguments(entry)} ]`, () => cb.apply(undefined, entry));
    }
}

const maxTheoryArgumentsLength = 50;

function formatTheoryArguments(entry: any[]) {
    const theoryArguments = entry.map(value => formatTheoryArgument(value)).join(", ");
    return theoryArguments.length <= maxTheoryArgumentsLength ? theoryArguments : theoryArguments.substr(0, maxTheoryArgumentsLength - 3) + "...";
}

function formatTheoryArgument(value: any) {
    switch (typeof value) {
        case "function":
            return value.name;
        case "object":
            if (value === null) {
                return "null";
            }
            else if (Array.isArray(value)) {
                return `Array(${value.length})`;
            }
            else if (typeof value.constructor === "function" && value.constructor.name) {
                return `${value.constructor.name}()`;
            }
            else {
                return "Object()";
            }
        default:
            return JSON.stringify(value);
    }
}