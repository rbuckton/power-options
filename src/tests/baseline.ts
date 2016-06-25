import * as fs from "fs";
import * as path from "path";
import * as chai from "chai";

export interface BaselineOptions {
    base?: string;
    local?: string;
    reference?: string;
}

export async function baseline(options: BaselineOptions, file: string, data: string | NodeJS.ReadableStream | undefined) {
    const local = await writeLocal(path.resolve(options.base || ".", options.local || "local", file), data);
    const reference = await readFile(path.resolve(options.base || ".", options.reference || "reference", file));
    try {
        chai.assert.equal(local, reference, `The baseline file '${file}' has changed.`);
    }
    catch (e) {
        e.expected = reference || "";
        e.actual = local || "";
        e.showDiff = true;
        throw e;
    }
}

async function writeLocal(local: string, data: string | NodeJS.ReadableStream | undefined) {
    if (data === undefined) {
        await unlinkFile(local);
        return undefined;
    }
    else if (typeof data === "string") {
        await writeFile(local, data);
        return data;
    }
    else {
        await writeStream(local, data);
        return await readFile(local);
    }
}

function ensureDirectory(dirname: string) {
    if (fs.existsSync(dirname)) return;
    const parentdir = path.dirname(dirname);
    if (parentdir && parentdir !== dirname) {
        ensureDirectory(parentdir);
    }
    fs.mkdirSync(dirname, 0o0777 & (~process.umask()));
}

function readFile(file: string) {
    return new Promise<string | undefined>((resolve) => {
        fs.readFile(file, /*encoding*/ "utf8", (err, data) => {
            resolve(err ? undefined : data);
        });
    });
}

function writeFile(file: string, text: string) {
    return new Promise<void>((resolve, reject) => {
        ensureDirectory(path.dirname(file));
        fs.writeFile(file, text, /*encoding*/ "utf8", (err) => err ? reject(err) : resolve());
    });
}

function writeStream(file: string, stream: NodeJS.ReadableStream) {
    return new Promise<void>((resolve, reject) => {
        ensureDirectory(path.dirname(file));
        stream
            .pipe(fs.createWriteStream(file, { encoding: "utf8" }), { end: true })
            .on("error", reject)
            .on("close", () => resolve());
    });
}

function unlinkFile(file: string) {
    return new Promise<void>((resolve) => {
        ensureDirectory(path.dirname(file));
        fs.unlink(file, () => resolve());
    });
}