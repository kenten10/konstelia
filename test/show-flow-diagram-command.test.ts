import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MaybeHealthyTourSummary } from "../src/application/tours/ListToursWithHealth";
import type { TourFlowSnapshot } from "../src/application/tours/LoadTourFlow";
import { AnchorHealth } from "../src/domain/tour/TourAnchor";
import { TourScope } from "../src/domain/tour/TourScope";
import {
  ShowFlowDiagramCommand,
  type ShowFlowDiagramUserInterface,
} from "../src/presentation/commands/ShowFlowDiagramCommand";
import type { Logger } from "../src/shared/logging/Logger";

const summary: MaybeHealthyTourSummary = {
  id: "auth-api",
  title: "Auth API",
  location: { scope: TourScope.Repository, uri: "mem:/repo/.konstelia/tours/auth-api.tour.yaml" },
};

const snapshot: TourFlowSnapshot = {
  tour: { id: "auth-api", title: "Auth API", steps: [] },
  anchorHealth: new Map(),
};

function createLogger(events: string[]): Logger {
  return {
    info: (message) => events.push(`log:${message}`),
    error: (message) => events.push(`error:${message}`),
  };
}

interface Harness {
  events: string[];
  userInterface: ShowFlowDiagramUserInterface;
  shown: MaybeHealthyTourSummary[];
}

function createUserInterface(scope: TourScope | undefined, chosen?: MaybeHealthyTourSummary): Harness {
  const events: string[] = [];
  const shown: MaybeHealthyTourSummary[] = [];
  return {
    events,
    shown,
    userInterface: {
      chooseScope: () => Promise.resolve(scope),
      chooseTour: (tours) => {
        shown.push(...tours);
        return Promise.resolve(chosen);
      },
      showDiagram: (value) => {
        events.push(`diagram:${value.tour.id}`);
        return Promise.resolve();
      },
      showInformation: (message) => {
        events.push(`info:${message}`);
        return Promise.resolve();
      },
      showError: (message) => {
        events.push(`shown-error:${message}`);
        return Promise.resolve();
      },
    },
  };
}

describe("ShowFlowDiagramCommand", () => {
  it("lists repository tours with their health so broken tours are visible", async () => {
    const harness = createUserInterface(TourScope.Repository, summary);
    const healthy = { ...summary, health: AnchorHealth.Broken, reasons: ["auth.login: missing"] };

    await new ShowFlowDiagramCommand(
      { execute: () => Promise.reject(new Error("Health must be used for shared scopes.")) },
      { execute: () => Promise.resolve([healthy]) },
      { execute: () => Promise.resolve(snapshot) },
      harness.userInterface,
      createLogger(harness.events),
    ).execute();

    assert.deepEqual(harness.shown, [healthy]);
    assert.deepEqual(harness.events, [
      "diagram:auth-api",
      "log:Showed the flow diagram for repository tour 'auth-api'.",
    ]);
  });

  it("lists personal tours without health because they are not bound yet", async () => {
    const harness = createUserInterface(TourScope.Personal, summary);

    await new ShowFlowDiagramCommand(
      { execute: () => Promise.resolve([summary]) },
      { execute: () => Promise.reject(new Error("Personal health needs a source binding.")) },
      { execute: () => Promise.resolve(snapshot) },
      harness.userInterface,
      createLogger(harness.events),
    ).execute();

    assert.deepEqual(harness.shown, [summary]);
    assert.equal(harness.events[0], "diagram:auth-api");
  });

  it("does nothing when the author dismisses the scope picker", async () => {
    const harness = createUserInterface(undefined);

    await new ShowFlowDiagramCommand(
      { execute: () => Promise.reject(new Error("Not used.")) },
      { execute: () => Promise.reject(new Error("Not used.")) },
      { execute: () => Promise.reject(new Error("Not used.")) },
      harness.userInterface,
      createLogger(harness.events),
    ).execute();

    assert.deepEqual(harness.events, []);
  });

  it("does nothing when the author dismisses the tour picker", async () => {
    const harness = createUserInterface(TourScope.Repository, undefined);

    await new ShowFlowDiagramCommand(
      { execute: () => Promise.resolve([summary]) },
      { execute: () => Promise.resolve([{ ...summary, health: AnchorHealth.Healthy, reasons: [] }]) },
      { execute: () => Promise.reject(new Error("Not used.")) },
      harness.userInterface,
      createLogger(harness.events),
    ).execute();

    assert.deepEqual(harness.events, []);
  });

  it("tells the author when a scope has no tours", async () => {
    const harness = createUserInterface(TourScope.Workspace, summary);

    await new ShowFlowDiagramCommand(
      { execute: () => Promise.resolve([]) },
      { execute: () => Promise.resolve([]) },
      { execute: () => Promise.reject(new Error("Not used.")) },
      harness.userInterface,
      createLogger(harness.events),
    ).execute();

    assert.deepEqual(harness.events, ["info:No workspace tours found."]);
  });

  it("reports a load failure", async () => {
    const harness = createUserInterface(TourScope.Repository, summary);

    await new ShowFlowDiagramCommand(
      { execute: () => Promise.resolve([summary]) },
      { execute: () => Promise.resolve([{ ...summary, health: AnchorHealth.Healthy, reasons: [] }]) },
      { execute: () => Promise.reject(new Error("Tour 'auth-api' was not found.")) },
      harness.userInterface,
      createLogger(harness.events),
    ).execute();

    assert.deepEqual(harness.events, [
      "error:Failed to show the flow diagram for a repository tour",
      "shown-error:Could not show the flow diagram: Tour 'auth-api' was not found.",
    ]);
  });
});
