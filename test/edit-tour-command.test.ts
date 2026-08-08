import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LoadTourDraftUseCase, TourDraft } from "../src/application/tours/LoadTourDraft";
import type { AnchorLister } from "../src/application/anchors/ListAnchors";
import type { UpdateTourInput, UpdateTourUseCase } from "../src/application/tours/UpdateTour";
import type { TourDocument } from "../src/domain/tour/TourDocument";
import { TourScope } from "../src/domain/tour/TourScope";
import {
  EditTourCommand,
  type EditTourUserInterface,
  type TourEditorAnchorAuthor,
  type TourEditorDependencies,
  type TourEditorHost,
} from "../src/presentation/commands/EditTourCommand";
import type { TourSummary } from "../src/infrastructure/storage/TourStorageProvider";
import type { Logger } from "../src/shared/logging/Logger";

const tour: TourDocument = {
  id: "auth-api",
  title: "Auth API",
  steps: [],
};

const summary: TourSummary = {
  id: "auth-api",
  title: "Auth API",
  location: { scope: TourScope.Repository, uri: "mem:/repo/.konstelia/tours/auth-api.tour.yaml" },
};

const draft: TourDraft = {
  scope: TourScope.Repository,
  tour,
  anchors: [{ id: "auth.login", file: "src/auth.ts", symbol: "login" }],
  stepTargets: [],
  tourIds: [],
};

function dependencies(
  updateTour: UpdateTourUseCase,
  logger: Logger = { info: () => undefined, error: () => undefined },
  anchorAuthor: TourEditorAnchorAuthor = { createInScope: () => Promise.reject(new Error("Not used.")) },
  listAnchors: AnchorLister = { execute: () => Promise.resolve([...draft.anchors]) },
): TourEditorDependencies {
  return { updateTour, listAnchors, anchorAuthor, logger };
}

function createLogger(events: string[]): Logger {
  return {
    info: (message) => events.push(`log:${message}`),
    error: (message) => events.push(`error:${message}`),
  };
}

describe("EditTourCommand", () => {
  it("opens the editor for the chosen tour and saves through the use case", async () => {
    const events: string[] = [];
    const inputs: UpdateTourInput[] = [];
    let host: TourEditorHost | undefined;
    const updateTour: UpdateTourUseCase = {
      validate: (input) => {
        inputs.push(input);
        return Promise.resolve([{ path: "title", message: "title must be a non-empty string." }]);
      },
      execute: (input) => {
        inputs.push(input);
        return Promise.resolve({ issues: [], location: summary.location });
      },
    };
    const userInterface: EditTourUserInterface = {
      chooseScope: (choices) => {
        events.push(`scopes:${choices.map((choice) => choice.scope).join(",")}`);
        return Promise.resolve(TourScope.Repository);
      },
      chooseTour: (tours) => {
        events.push(`tours:${tours.map((candidate) => candidate.id).join(",")}`);
        return Promise.resolve(summary);
      },
      openEditor: (opened, editorHost) => {
        events.push(`open:${opened.tour.id}:${opened.anchors.length}`);
        host = editorHost;
        return Promise.resolve();
      },
      showInformation: () => Promise.resolve(),
      showError: (message) => {
        events.push(`shown-error:${message}`);
        return Promise.resolve();
      },
    };
    const loadDraft: LoadTourDraftUseCase = {
      execute: (scope, id) => {
        events.push(`draft:${scope}:${id}`);
        return Promise.resolve(draft);
      },
    };

    await new EditTourCommand(
      { execute: () => Promise.resolve([summary]) },
      loadDraft,
      dependencies(updateTour),
      userInterface,
      createLogger(events),
    ).execute();

    assert.deepEqual(events, [
      "scopes:personal,workspace,repository",
      "tours:auth-api",
      "draft:repository:auth-api",
      "open:auth-api:1",
      "log:Opened the tour editor for repository tour 'auth-api'.",
    ]);

    assert.ok(host);
    assert.equal((await host.validate(tour))[0]?.path, "title");
    assert.deepEqual(await host.save(tour), []);
    assert.deepEqual(inputs.map((input) => input.scope), [TourScope.Repository, TourScope.Repository]);
  });

  it("keeps issues and logs a rejection when the edit does not validate", async () => {
    const events: string[] = [];
    const issues = [{ path: "steps[0].hops[0].anchors", message: "anchors must contain exactly one primary item; found 2." }];
    let host: TourEditorHost | undefined;
    const userInterface: EditTourUserInterface = {
      chooseScope: () => Promise.resolve(TourScope.Repository),
      chooseTour: () => Promise.resolve(summary),
      openEditor: (_draft, editorHost) => {
        host = editorHost;
        return Promise.resolve();
      },
      showInformation: () => Promise.resolve(),
      showError: () => Promise.resolve(),
    };

    await new EditTourCommand(
      { execute: () => Promise.resolve([summary]) },
      { execute: () => Promise.resolve(draft) },
      dependencies({
        validate: () => Promise.resolve(issues),
        execute: () => Promise.resolve({ issues }),
      }, createLogger(events)),
      userInterface,
      createLogger(events),
    ).execute();

    assert.ok(host);
    assert.deepEqual(await host.save(tour), issues);
    assert.ok(!events.some((event) => event.startsWith("log:Saved")));
    assert.ok(events.includes("log:Rejected the edit to repository tour 'auth-api' with 1 issue(s)."));
  });

  it("refuses to write a document whose id is not the edited tour", async () => {
    const events: string[] = [];
    const writes: string[] = [];
    let host: TourEditorHost | undefined;
    const userInterface: EditTourUserInterface = {
      chooseScope: () => Promise.resolve(TourScope.Repository),
      chooseTour: () => Promise.resolve(summary),
      openEditor: (_draft, editorHost) => {
        host = editorHost;
        return Promise.resolve();
      },
      showInformation: () => Promise.resolve(),
      showError: () => Promise.resolve(),
    };

    await new EditTourCommand(
      { execute: () => Promise.resolve([summary]) },
      { execute: () => Promise.resolve(draft) },
      dependencies({
        validate: (input: UpdateTourInput) => {
          writes.push(`validate:${input.tour.id}`);
          return Promise.resolve([]);
        },
        execute: (input: UpdateTourInput) => {
          writes.push(`save:${input.tour.id}`);
          return Promise.resolve({ issues: [] });
        },
      }),
      userInterface,
      createLogger(events),
    ).execute();

    const editor = host;
    assert.ok(editor);
    await assert.rejects(
      () => editor.save({ ...tour, id: "another-tour" }),
      /This editor edits tour 'auth-api', not 'another-tour'\./,
    );
    assert.deepEqual(writes, []);
  });

  it("reports a save failure to the log before it reaches the editor", async () => {
    const events: string[] = [];
    let host: TourEditorHost | undefined;
    const userInterface: EditTourUserInterface = {
      chooseScope: () => Promise.resolve(TourScope.Repository),
      chooseTour: () => Promise.resolve(summary),
      openEditor: (_draft, editorHost) => {
        host = editorHost;
        return Promise.resolve();
      },
      showInformation: () => Promise.resolve(),
      showError: () => Promise.resolve(),
    };

    await new EditTourCommand(
      { execute: () => Promise.resolve([summary]) },
      { execute: () => Promise.resolve(draft) },
      dependencies({
        validate: () => Promise.resolve([]),
        execute: () => Promise.reject(new Error("Disk is full.")),
      }, createLogger(events)),
      userInterface,
      createLogger(events),
    ).execute();

    const editor = host;
    assert.ok(editor);
    await assert.rejects(() => editor.save(tour), /Disk is full\./);
    assert.ok(events.includes("error:Failed to save repository tour 'auth-api'"));
  });

  it("creates an anchor in the edited tour's scope and returns refreshed choices", async () => {
    const events: string[] = [];
    let host: TourEditorHost | undefined;
    const userInterface: EditTourUserInterface = {
      chooseScope: () => Promise.resolve(TourScope.Repository),
      chooseTour: () => Promise.resolve(summary),
      openEditor: (_draft, editorHost) => {
        host = editorHost;
        return Promise.resolve();
      },
      showInformation: () => Promise.resolve(),
      showError: () => Promise.resolve(),
    };
    const anchorAuthor = {
      createInScope: (scope: TourScope) => {
        events.push(`anchor:${scope}`);
        return Promise.resolve({ id: "auth.new" });
      },
    };
    const refreshed = [
      { id: "auth.login", file: "src/auth.ts", symbol: "login" },
      { id: "auth.new", file: "src/auth.ts", symbol: "verify" },
    ];

    await new EditTourCommand(
      { execute: () => Promise.resolve([summary]) },
      { execute: () => Promise.resolve(draft) },
      dependencies(
        { validate: () => Promise.resolve([]), execute: () => Promise.resolve({ issues: [] }) },
        createLogger(events),
        anchorAuthor,
        { execute: () => Promise.resolve([...refreshed]) },
      ),
      userInterface,
      createLogger(events),
    ).execute();

    assert.ok(host);
    assert.deepEqual(await host.createAnchor(), { id: "auth.new", anchors: refreshed });
    assert.ok(events.includes("anchor:repository"));
  });

  it("reports nothing when anchor creation is cancelled", async () => {
    let host: TourEditorHost | undefined;
    const userInterface: EditTourUserInterface = {
      chooseScope: () => Promise.resolve(TourScope.Repository),
      chooseTour: () => Promise.resolve(summary),
      openEditor: (_draft, editorHost) => {
        host = editorHost;
        return Promise.resolve();
      },
      showInformation: () => Promise.resolve(),
      showError: () => Promise.resolve(),
    };

    await new EditTourCommand(
      { execute: () => Promise.resolve([summary]) },
      { execute: () => Promise.resolve(draft) },
      dependencies(
        { validate: () => Promise.resolve([]), execute: () => Promise.resolve({ issues: [] }) },
        undefined,
        { createInScope: () => Promise.resolve(undefined) },
        { execute: () => Promise.reject(new Error("Choices must not be reloaded.")) },
      ),
      userInterface,
      createLogger([]),
    ).execute();

    assert.ok(host);
    assert.equal(await host.createAnchor(), undefined);
  });

  it("does nothing when the author dismisses the scope picker", async () => {
    const events: string[] = [];
    const userInterface: EditTourUserInterface = {
      chooseScope: () => Promise.resolve(undefined),
      chooseTour: () => Promise.reject(new Error("Not used.")),
      openEditor: () => Promise.reject(new Error("Not used.")),
      showInformation: () => Promise.resolve(),
      showError: () => Promise.resolve(),
    };

    await new EditTourCommand(
      { execute: () => Promise.reject(new Error("Not used.")) },
      { execute: () => Promise.reject(new Error("Not used.")) },
      dependencies({
        validate: () => Promise.reject(new Error("Not used.")),
        execute: () => Promise.reject(new Error("Not used.")),
      }),
      userInterface,
      createLogger(events),
    ).execute();

    assert.deepEqual(events, []);
  });

  it("tells the author when a scope has no tours", async () => {
    const events: string[] = [];
    const userInterface: EditTourUserInterface = {
      chooseScope: () => Promise.resolve(TourScope.Workspace),
      chooseTour: () => Promise.reject(new Error("Not used.")),
      openEditor: () => Promise.reject(new Error("Not used.")),
      showInformation: (message) => {
        events.push(`info:${message}`);
        return Promise.resolve();
      },
      showError: () => Promise.resolve(),
    };

    await new EditTourCommand(
      { execute: () => Promise.resolve([]) },
      { execute: () => Promise.reject(new Error("Not used.")) },
      dependencies({
        validate: () => Promise.reject(new Error("Not used.")),
        execute: () => Promise.reject(new Error("Not used.")),
      }),
      userInterface,
      createLogger(events),
    ).execute();

    assert.deepEqual(events, ["info:No workspace tours found."]);
  });

  it("reports a load failure without opening an editor", async () => {
    const events: string[] = [];
    const userInterface: EditTourUserInterface = {
      chooseScope: () => Promise.resolve(TourScope.Repository),
      chooseTour: () => Promise.resolve(summary),
      openEditor: () => Promise.reject(new Error("Not used.")),
      showInformation: () => Promise.resolve(),
      showError: (message) => {
        events.push(`shown-error:${message}`);
        return Promise.resolve();
      },
    };

    await new EditTourCommand(
      { execute: () => Promise.resolve([summary]) },
      { execute: () => Promise.reject(new Error("Tour 'auth-api' was not found.")) },
      dependencies({
        validate: () => Promise.reject(new Error("Not used.")),
        execute: () => Promise.reject(new Error("Not used.")),
      }),
      userInterface,
      createLogger(events),
    ).execute();

    assert.deepEqual(events, [
      "error:Failed to edit repository tour",
      "shown-error:Could not edit tour: Tour 'auth-api' was not found.",
    ]);
  });
});
