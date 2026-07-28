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
