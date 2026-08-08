import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TourHealthLister } from "../src/application/tours/ListToursWithHealth";
import { PlayTour } from "../src/application/tours/PlayTour";
import type { TourAnchorRegistryResolver } from "../src/application/tours/TourAnchorRegistry";
import type { TourPlayback } from "../src/application/tours/TourPlayback";
import type { TourSourceBindingStore } from "../src/application/tours/TourSourceBinding";
import type { TourDocument } from "../src/domain/tour/TourDocument";
import { AnchorHealth } from "../src/domain/tour/TourAnchor";
import { TourScope } from "../src/domain/tour/TourScope";
import type { TourStorageResolver } from "../src/infrastructure/storage/TourStorageResolver";
import {
  PlayTourCommand,
  type PlayTourUserInterface,
} from "../src/presentation/commands/PlayTourCommand";
import type { Logger } from "../src/shared/logging/Logger";

const tour: TourDocument = { id: "shared", title: "Shared Tour", steps: [] };

describe("PlayTour", () => {
  it("loads the tour and anchors from the same logical scope", async () => {
    const events: string[] = [];
    const storageResolver = {
      resolve: (scope: TourScope) => ({
        loadTour: (id: string) => {
          events.push(`tour:${scope}:${id}`);
          return Promise.resolve(tour);
        },
      }),
    } as TourStorageResolver;
    const anchorRegistryResolver = {
      resolve: (scope: TourScope) => ({
        loadAnchors: () => {
          events.push(`anchors:${scope}`);
          return Promise.resolve([{ id: "entry", file: "entry.ts", symbol: "entry" }]);
        },
      }),
    } as TourAnchorRegistryResolver;
    const playback: TourPlayback = {
      start: (selectedTour, anchors) => {
        events.push(`play:${selectedTour.id}:${anchors[0]?.id}`);
        return Promise.resolve();
      },
    };

    await new PlayTour(storageResolver, anchorRegistryResolver, playback).execute(
      TourScope.Workspace,
      "shared",
    );

    assert.deepEqual(events, [
      "tour:workspace:shared",
      "anchors:workspace",
      "play:shared:entry",
    ]);
  });
});

describe("PlayTourCommand", () => {
  it("coordinates scope and tour selection without filesystem access", async () => {
    const events: string[] = [];
    const summary = {
      id: tour.id,
      title: tour.title,
      location: { scope: TourScope.Repository, uri: "mem:/shared.tour.yaml" },
      health: AnchorHealth.Healthy,
      reasons: [],
    };
    const listTours = {
      execute: (scope: TourScope) => {
        events.push(`list:${scope}`);
        return Promise.resolve([summary]);
      },
    } as TourHealthLister;
    const playTour = {
      execute: (scope: TourScope, id: string) => {
        events.push(`play:${scope}:${id}`);
        return Promise.resolve();
      },
    };
    const userInterface: PlayTourUserInterface = {
      chooseScope: () => Promise.resolve(TourScope.Repository),
      chooseTour: (tours) => Promise.resolve(tours[0]),
      getCurrentSourceWorkspace: () => ({ uri: "mem:/repo", name: "repo" }),
      confirmPersonalSourceBinding: () => Promise.resolve(false),
      showInformation: () => Promise.resolve(),
      showError: () => Promise.resolve(),
    };
    const sourceBindings: TourSourceBindingStore = {
      get: () => Promise.resolve(undefined),
      set: () => Promise.resolve(),
    };
    const logger: Logger = { info: () => undefined, error: () => undefined };

    await new PlayTourCommand(
      { execute: () => Promise.resolve([]) },
      listTours,
      playTour,
      sourceBindings,
      userInterface,
      logger,
    ).execute();

    assert.deepEqual(events, ["list:repository", "play:repository:shared"]);
  });

  it("requires explicit rebinding before playing a personal tour in another workspace", async () => {
    const events: string[] = [];
    const personalTour = {
      id: "private",
      title: "Private",
      location: { scope: TourScope.Personal, uri: "mem:/private.tour.yaml" },
      health: AnchorHealth.Healthy,
      reasons: [],
    };
    const listTours = {
      execute: () => {
        events.push("health");
        return Promise.resolve([personalTour]);
      },
    } as TourHealthLister;
    const playTour = {
      execute: () => {
        events.push("play");
        return Promise.resolve();
      },
    };
    const sourceBindings: TourSourceBindingStore = {
      get: () => Promise.resolve("mem:/old-workspace"),
      set: (_scope, id, root) => {
        events.push(`bind:${id}:${root}`);
        return Promise.resolve();
      },
    };
    let allowRebind = false;
    const userInterface: PlayTourUserInterface = {
      chooseScope: () => Promise.resolve(TourScope.Personal),
      chooseTour: (tours) => Promise.resolve(tours[0]),
      getCurrentSourceWorkspace: () => ({ uri: "mem:/new-workspace", name: "new" }),
      confirmPersonalSourceBinding: () => Promise.resolve(allowRebind),
      showInformation: () => Promise.resolve(),
      showError: () => Promise.resolve(),
    };
    const logger: Logger = { info: () => undefined, error: () => undefined };
    const command = new PlayTourCommand(
      { execute: () => Promise.resolve([personalTour]) },
      listTours,
      playTour,
      sourceBindings,
      userInterface,
      logger,
    );

    await command.execute();
    assert.deepEqual(events, []);

    allowRebind = true;
    await command.execute();
    assert.deepEqual(events, ["bind:private:mem:/new-workspace", "health", "play"]);
  });

  it("blocks a broken tour before playback", async () => {
    const events: string[] = [];
    const brokenTour = {
      id: "broken",
      title: "Broken Tour",
      location: { scope: TourScope.Repository, uri: "mem:/broken.tour.yaml" },
      health: AnchorHealth.Broken,
      reasons: ["entry: symbol could not be resolved"],
    };
    const userInterface: PlayTourUserInterface = {
      chooseScope: () => Promise.resolve(TourScope.Repository),
      chooseTour: () => Promise.resolve(brokenTour),
      getCurrentSourceWorkspace: () => ({ uri: "mem:/repo", name: "repo" }),
      confirmPersonalSourceBinding: () => Promise.resolve(true),
      showInformation: () => Promise.resolve(),
      showError: (message) => {
        events.push(message);
        return Promise.resolve();
      },
    };
    await new PlayTourCommand(
      { execute: () => Promise.resolve([]) },
      { execute: () => Promise.resolve([brokenTour]) },
      { execute: () => Promise.reject(new Error("Playback must not start.")) },
      { get: () => Promise.resolve(undefined), set: () => Promise.resolve() },
      userInterface,
      { info: () => undefined, error: () => undefined },
    ).execute();

    assert.equal(events.length, 1);
    assert.match(events[0] ?? "", /under maintenance/);
  });

  it("checks personal binding before evaluating broken health", async () => {
    const events: string[] = [];
    const personalTour = {
      id: "private",
      title: "Private",
      location: { scope: TourScope.Personal, uri: "mem:/private.tour.yaml" },
    };
    const brokenTour = {
      ...personalTour,
      health: AnchorHealth.Broken,
      reasons: ["source does not exist in this workspace"],
    };
    const userInterface: PlayTourUserInterface = {
      chooseScope: () => Promise.resolve(TourScope.Personal),
      chooseTour: (tours) => Promise.resolve(tours[0]),
      getCurrentSourceWorkspace: () => ({ uri: "mem:/new-workspace", name: "new" }),
      confirmPersonalSourceBinding: () => {
        events.push("confirm-binding");
        return Promise.resolve(true);
      },
      showInformation: () => Promise.resolve(),
      showError: () => {
        events.push("blocked");
        return Promise.resolve();
      },
    };
    await new PlayTourCommand(
      { execute: () => Promise.resolve([personalTour]) },
      {
        execute: () => {
          events.push("health");
          return Promise.resolve([brokenTour]);
        },
      },
      { execute: () => Promise.reject(new Error("Playback must not start.")) },
      {
        get: () => Promise.resolve("mem:/old-workspace"),
        set: () => {
          events.push("bind");
          return Promise.resolve();
        },
      },
      userInterface,
      { info: () => undefined, error: () => undefined },
    ).execute();

    assert.deepEqual(events, ["confirm-binding", "bind", "health", "blocked"]);
  });
});
