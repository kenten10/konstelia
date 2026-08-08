import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CreateTourUseCase } from "../src/application/tours/CreateTour";
import type { TourSourceBindingStore } from "../src/application/tours/TourSourceBinding";
import { TourScope } from "../src/domain/tour/TourScope";
import { CreateTourCommand, type CreateTourUserInterface } from "../src/presentation/commands/CreateTourCommand";
import type { Logger } from "../src/shared/logging/Logger";

describe("CreateTourCommand", () => {
  it("coordinates UI and the use case without a filesystem dependency", async () => {
    const events: string[] = [];
    const useCase: CreateTourUseCase = {
      execute: (input) => {
        events.push(`create:${input.scope}:${input.title}`);
        return Promise.resolve({
          tour: { id: "private-tour", title: input.title, steps: [] },
          location: {
            scope: input.scope,
            uri: "mem:/private-tour.tour.yaml",
            documentUri: "mem:/private-tour.tour.yaml",
          },
        });
      },
    };
    const userInterface: CreateTourUserInterface = {
      chooseScope: () => Promise.resolve(TourScope.Personal),
      askForTitle: () => Promise.resolve("Private Tour"),
      getCurrentSourceWorkspace: () => ({ uri: "mem:/workspace", name: "workspace" }),
      openDocument: (value) => {
        events.push(`open:${value.toString()}`);
        return Promise.resolve();
      },
      showSuccess: () => {
        events.push("success");
        return Promise.resolve();
      },
      showError: () => Promise.resolve(),
    };
    const logger: Logger = {
      info: () => events.push("log"),
      error: () => undefined,
    };
    const sourceBindings: TourSourceBindingStore = {
      get: () => Promise.resolve(undefined),
      set: (scope, id, sourceRoot) => {
        events.push(`bind:${scope}:${id}:${sourceRoot}`);
        return Promise.resolve();
      },
    };

    await new CreateTourCommand(useCase, sourceBindings, userInterface, logger).execute();

    assert.deepEqual(events, [
      "create:personal:Private Tour",
      "bind:personal:private-tour:mem:/workspace",
      "open:mem:/private-tour.tour.yaml",
      "success",
      "log",
    ]);
  });
});
