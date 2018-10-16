import { CommandLine } from "../lib";
import { expect } from "chai";
import { PassThrough } from "stream";
import { StringWritable } from "./utils";

describe("commandLine", () => {
    describe("parseAndExecute", () => {
        it("unhandled", async () => {
            const commandLine = new CommandLine({
                commands: {
                    "a": {}
                }
            });
            const result = await commandLine.parseAndExecute(["a"], {});
            expect(result.handled).to.be.false;
        });
        it("handled by command", async () => {
            let execOptions: any;
            let execContext: any;
            const commandLine = new CommandLine({
                commands: {
                    "a": {
                        exec: (parsed, context) => {
                            execOptions = parsed.options;
                            execContext = context;
                        }
                    }
                }
            });
            const context = {};
            const result = await commandLine.parseAndExecute(["a"], context);
            expect(result.handled).to.be.true;
            expect(execOptions).to.equal(result.options);
            expect(execContext).to.equal(context);
        });
        it("handled by fallback", async () => {
            let execOptions: any;
            let execContext: any;
            const commandLine = new CommandLine({
                commands: {
                    "a": { }
                },
                exec: (parsed, context) => {
                    execOptions = parsed.options;
                    execContext = context;
                }
            });
            const context = {};
            const result = await commandLine.parseAndExecute(["a"], context);
            expect(result.handled).to.be.true;
            expect(execOptions).to.equal(result.options);
            expect(execContext).to.equal(context);
        });
        it("handle with help", async () => {
            const savedExit = process.exit;
            try {
                process.exit = (_?: number): never => { throw new Error("process.exit was called"); };

                const stdout = new StringWritable();
                const stderr = new StringWritable();
                const commandLine = new CommandLine({
                    auto: "print",
                    stdout,
                    stderr,
                    commands: {
                        "a": {
                            exec: (parsed) => {
                                parsed.help = true;
                            }
                        }
                    }
                });

                const result = await commandLine.parseAndExecute(["a"], {});
                stdout.end();
                stderr.end();

                const out = await stdout.waitForEnd();
                const err = await stderr.waitForEnd();

                expect(out.length).to.be.greaterThan(0);
                expect(err.length).to.equal(0);
                expect(result.help).to.be.true;
                expect(result.handled).to.be.true;
            }
            finally {
                process.exit = savedExit;
            }
        });
        it("handle with error", async () => {
            const savedExit = process.exit;
            try {
                process.exit = (_?: number): never => { throw new Error("process.exit was called"); };

                const stdout = new StringWritable();
                const stderr = new StringWritable();
                const commandLine = new CommandLine({
                    auto: "print",
                    stdout,
                    stderr,
                    commands: {
                        "a": {
                            exec: (parsed) => {
                                parsed.error = "An error occurred.";
                            }
                        }
                    }
                });

                const result = await commandLine.parseAndExecute(["a"], {});
                stdout.end();
                stderr.end();

                const out = await stdout.waitForEnd();
                const err = await stderr.waitForEnd();

                expect(out.length).to.equal(0);
                expect(err.length).to.be.greaterThan(0);
                expect(result.error).to.equal("An error occurred.");
                expect(result.handled).to.be.true;
            }
            finally {
                process.exit = savedExit;
            }
        });
        it("exit with help", async () => {
            const savedExit = process.exit;
            try {
                const exitSentinel: { code?: number } = { };
                process.exit = (code?: number): never => {
                    exitSentinel.code = code;
                    throw exitSentinel;
                };

                const stdout = new StringWritable();
                const stderr = new StringWritable();
                const commandLine = new CommandLine({
                    auto: true,
                    stdout,
                    stderr,
                    commands: {
                        "a": {
                            exec: (parsed) => {
                                parsed.help = true;
                                parsed.status = 1234;
                            }
                        }
                    }
                });

                try {
                    await commandLine.parseAndExecute(["a"], {});
                }
                catch (e) {
                    expect(e).to.equal(exitSentinel);
                }

                stdout.end();
                stderr.end();

                const out = await stdout.waitForEnd();
                const err = await stderr.waitForEnd();

                expect(out.length).to.be.greaterThan(0);
                expect(err.length).to.equal(0);
                expect(exitSentinel.code).to.equal(1234);
            }
            finally {
                process.exit = savedExit;
            }
        });
        it("exit with error", async () => {
            const savedExit = process.exit;
            try {
                const exitSentinel: { code?: number } = { };
                process.exit = (code?: number): never => {
                    exitSentinel.code = code;
                    throw exitSentinel;
                };

                const stdout = new StringWritable();
                const stderr = new StringWritable();
                const commandLine = new CommandLine({
                    auto: true,
                    stdout,
                    stderr,
                    commands: {
                        "a": {
                            exec: (parsed) => {
                                parsed.error = "An error occurred.";
                                parsed.status = 1234;
                            }
                        }
                    }
                });

                try {
                    await commandLine.parseAndExecute(["a"], {});
                }
                catch (e) {
                    expect(e).to.equal(exitSentinel);
                }

                stdout.end();
                stderr.end();

                const out = await stdout.waitForEnd();
                const err = await stderr.waitForEnd();

                expect(out.length).to.equal(0);
                expect(err.length).to.be.greaterThan(0);
                expect(exitSentinel.code).to.equal(1234);
            }
            finally {
                process.exit = savedExit;
            }
        });
    });
});