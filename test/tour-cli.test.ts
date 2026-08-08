import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { runTourCli } from "../src/cli/TourCli";

describe("tour validate CLI", () => {
  let root = "";

  before(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "konstelia-cli-"));
    await mkdir(path.join(root, ".konstelia", "tours"), { recursive: true });
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("returns zero and JSON for a healthy project", async () => {
    await writeFixture(
      `anchors:
  - id: app.run
    file: src/app.ts
    symbol: run
`,
      "export function run() { return true; }\n",
    );
    const output = captureOutput();

    const exitCode = await runTourCli(["validate", "--format", "json"], root, output);
    const report = JSON.parse(output.messages.join("\n")) as { health: string };

    assert.equal(exitCode, 0);
    assert.equal(report.health, "healthy");
    assert.deepEqual(output.errors, []);
  });

  it("returns nonzero when an anchor is broken", async () => {
    await writeFixture(
      `anchors:
  - id: app.run
    file: src/app.ts
    symbol: missing
`,
      "export function run() { return true; }\n",
    );
    const output = captureOutput();

    const exitCode = await runTourCli(["validate", "--format", "json"], root, output);
    const report = JSON.parse(output.messages.join("\n")) as {
      health: string;
      anchors: { health: string }[];
    };

    assert.equal(exitCode, 1);
    assert.equal(report.health, "broken");
    assert.equal(report.anchors[0]?.health, "broken");
  });

  it("returns zero for a drifted anchor so drift does not fail CI", async () => {
    // The symbol path still resolves, but its ordinal now points at another declaration.
    await writeFixture(
      `anchors:
  - id: app.run
    file: src/app.ts
    symbol: run#1
    snapshot:
      hash: sha256:unused
      text: |-
        export function run(value: unknown) { return String(value); }
`,
      `export function run(value: number): number;
export function run(value: string): string;
export function run(value: unknown) { return String(value); }
`,
    );
    const output = captureOutput();

    const exitCode = await runTourCli(["validate", "--format", "json"], root, output);
    const report = JSON.parse(output.messages.join("\n")) as {
      health: string;
      anchors: { health: string }[];
    };

    assert.equal(report.anchors[0]?.health, "drifted");
    assert.equal(report.health, "drifted");
    assert.equal(exitCode, 0);
  });

  it("accepts the default format explicitly and reports it in human form", async () => {
    await writeFixture(
      `anchors:
  - id: app.run
    file: src/app.ts
    symbol: run
`,
      "export function run() { return true; }\n",
    );
    const output = captureOutput();

    const exitCode = await runTourCli(["validate", "--format", "human"], root, output);

    assert.equal(exitCode, 0);
    assert.match(output.messages.join("\n"), /Konstelia validation: healthy/);
  });

  it("rejects unusable arguments with the usage exit code", async () => {
    for (const args of [["build"], ["validate", "--format"], ["validate", "--format", "xml"], ["validate", "--wat"]]) {
      const output = captureOutput();

      assert.equal(await runTourCli(args, root, output), 2, args.join(" "));
      assert.match(output.errors.join("\n"), /Usage: tour validate/);
    }
  });

  it("separates a missing project from a broken one", async () => {
    const output = captureOutput();

    const exitCode = await runTourCli(["validate"], path.join(root, "src"), output);

    assert.equal(exitCode, 2);
    assert.match(output.errors.join("\n"), /No \.konstelia directory found/);
    assert.deepEqual(output.messages, []);
  });

  async function writeFixture(anchorYaml: string, source: string): Promise<void> {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, ".konstelia", "anchors.yaml"), anchorYaml);
    await writeFile(path.join(root, ".konstelia", "tours", "tour.tour.yaml"), `id: tour
title: Tour
steps:
  - id: step
    title: Step
    hops:
      - summary: Run
        anchors:
          - ref: app.run
            emphasis: primary
`);
    await writeFile(path.join(root, "src", "app.ts"), source);
  }
});

function captureOutput(): {
  messages: string[];
  errors: string[];
  write(message: string): void;
  writeError(message: string): void;
} {
  const messages: string[] = [];
  const errors: string[] = [];
  return {
    messages,
    errors,
    write: (message) => messages.push(message),
    writeError: (message) => errors.push(message),
  };
}
