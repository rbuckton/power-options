import { assert, expect } from "chai";
import { PassThrough, Writable } from "stream";
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

export class StringWritable extends Writable {
    private _promise: Promise<string>;
    private _resolve: (value: string) => void;
    private _reject: (reason: any) => void;
    private _string: string;

    constructor() {
        super();
        this._string = "";
        this._promise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
    }

    _write(chunk: string | Buffer, _encoding: string, callback: (error?: Error | null) => void) {
        if (Buffer.isBuffer(chunk)) chunk = chunk.toString("utf8");
        this._string += chunk;
        callback();
    }

    _writev(chunks: Array<{ chunk: string | Buffer, encoding: string }>, callback: (error?: Error | null) => void): void {
        for (let { chunk } of chunks) {
            if (Buffer.isBuffer(chunk)) chunk = chunk.toString("utf8");
            this._string += chunk;
        }
        callback();
    }

    _final(callback: (error?: Error | null) => void): void {
        this._resolve(this._string);
        this._string = "";
        callback();
    }

    _destroy(error: Error | null, callback: (error: Error | null) => void): void {
        if (error) {
            this._reject(error);
        }
        else {
            this._resolve(this._string);
            this._string = "";
        }
        callback(error);
    }

    waitForEnd() {
        return this._promise;
    }
}