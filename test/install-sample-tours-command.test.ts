import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { InstallSampleTours } from "../src/application/tours/InstallSampleTours";
import type { TourSourceBindingStore } from "../src/application/tours/TourSourceBinding";
import { TourScope } from "../src/domain/tour/TourScope";
import {
  InstallSampleToursCommand,
  type InstallSampleToursUserInterface,
} from "../src/presentation/commands/InstallSampleToursCommand";
import type { Logger } from "../src/shared/logging/Logger";

describe("InstallSampleToursCommand", () => {
  it("binds the personal sample and reports installation without filesystem access", async () => {
    const events: string[] = [];
    const installer = {
      execute: () => Promise.resolve([
        { scope: TourScope.Personal, tourId: "personal", installed: true },
        { scope: TourScope.Workspace, tourId: "workspace", installed: true },
        { scope: TourScope.Repository, tourId: "repository", installed: true },
      ]),
    } as unknown as InstallSampleTours;
    const sourceBindings: TourSourceBindingStore = {
      get: () => Promise.resolve(undefined),
      set: (scope, id, root) => {
        events.push(`bind:${scope}:${id}:${root}`);
        return Promise.resolve();
      },
    };
    const userInterface: InstallSampleToursUserInterface = {
      getCurrentSourceWorkspace: () => ({ uri: "mem:/repo", name: "repo" }),
      isBundledSampleWorkspace: () => true,
      openBundledSampleWorkspace: () => Promise.resolve(false),
      showSuccess: (message) => {
        events.push(message);
        return Promise.resolve();
      },
      showError: () => Promise.resolve(),
    };
    const logger: Logger = {
      info: () => events.push("logged"),
      error: () => undefined,
    };

    await new InstallSampleToursCommand(
      installer,
      sourceBindings,
      userInterface,
      logger,
    ).execute();

    assert.deepEqual(events, [
      "bind:personal:personal:mem:/repo",
      "Installed 3 sample tours. Use Konstelia: Play Tour to open them.",
      "logged",
    ]);
  });

  it("offers to open the bundled workspace instead of installing into an empty window", async () => {
    const events: string[] = [];
    const installer = {
      execute: () => {
        events.push("install");
        return Promise.resolve([]);
      },
    } as unknown as InstallSampleTours;
    const sourceBindings: TourSourceBindingStore = {
      get: () => Promise.resolve(undefined),
      set: () => Promise.resolve(),
    };
    const userInterface: InstallSampleToursUserInterface = {
      getCurrentSourceWorkspace: () => undefined,
      isBundledSampleWorkspace: () => false,
      openBundledSampleWorkspace: () => {
        events.push("open-workspace");
        return Promise.resolve(true);
      },
      showSuccess: () => Promise.resolve(),
      showError: () => {
        events.push("error");
        return Promise.resolve();
      },
    };
    const logger: Logger = { info: () => undefined, error: () => undefined };

    await new InstallSampleToursCommand(
      installer,
      sourceBindings,
      userInterface,
      logger,
    ).execute();

    assert.deepEqual(events, ["open-workspace"]);
  });

  it("opens the bundled workspace instead of writing into an arbitrary repository", async () => {
    const events: string[] = [];
    const installer = { execute: () => { events.push("install"); return Promise.resolve([]); } } as unknown as InstallSampleTours;
    const sourceBindings: TourSourceBindingStore = {
      get: () => Promise.resolve(undefined),
      set: () => Promise.resolve(),
    };
    const userInterface: InstallSampleToursUserInterface = {
      getCurrentSourceWorkspace: () => ({ uri: "mem:/unrelated", name: "unrelated" }),
      isBundledSampleWorkspace: () => false,
      openBundledSampleWorkspace: () => { events.push("open-workspace"); return Promise.resolve(true); },
      showSuccess: () => Promise.resolve(),
      showError: () => Promise.resolve(),
    };
    await new InstallSampleToursCommand(
      installer,
      sourceBindings,
      userInterface,
      { info: () => undefined, error: () => undefined },
    ).execute();
    assert.deepEqual(events, ["open-workspace"]);
  });
});
