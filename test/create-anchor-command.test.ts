import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CreateAnchor } from "../src/application/anchors/CreateAnchor";
import { CreateAnchorCommand, type CreateAnchorUserInterface } from "../src/presentation/commands/CreateAnchorCommand";

describe("CreateAnchorCommand", () => {
  it("requires confirmation before saving a snapped target", async () => {
    const events: string[] = [];
    const service = {
      propose: () => ({
        file: "Service.java",
        symbol: "Service",
        snapshot: { hash: "sha256:test", text: "class Service {}" },
        range: { start: 0, end: 16 },
        suggestedId: "service",
        snapped: true,
        note: "Selection snapped to the nearest stable Java symbol.",
      }),
      save: () => { events.push("save"); return Promise.reject(new Error("must not save")); },
    } as unknown as CreateAnchor;
    const ui: CreateAnchorUserInterface = {
      captureSelection: () => Promise.resolve({
        file: "Service.java",
        sourceText: "class Service {}",
        selectionStart: 6,
        selectionEnd: 13,
      }),
      confirmSnappedTarget: () => { events.push("confirm"); return Promise.resolve(false); },
      chooseScope: () => { events.push("scope"); return Promise.resolve(undefined); },
      askForId: () => Promise.resolve(undefined),
      showSuccess: () => Promise.resolve(),
      showError: () => Promise.resolve(),
    };

    await new CreateAnchorCommand(
      service,
      ui,
      { info: () => undefined, error: () => undefined },
    ).execute();

    assert.deepEqual(events, ["confirm"]);
  });
});
