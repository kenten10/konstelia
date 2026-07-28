import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ListTours } from "../src/application/tours/ListTours";
import { TourScope } from "../src/domain/tour/TourScope";
import type { TourSummary } from "../src/infrastructure/storage/TourStorageProvider";
import {
  BrowseToursCommand,
  type BrowseToursUserInterface,
} from "../src/presentation/commands/BrowseToursCommand";
import type { Logger } from "../src/shared/logging/Logger";
import { uri } from "./fakes";

describe("BrowseToursCommand", () => {
  it("lists the selected logical scope and opens the selected location", async () => {
    const events: string[] = [];
    const tour: TourSummary = {
      id: "sample",
      title: "Sample",
      location: {
        scope: TourScope.Repository,
        uri: uri("mem:/sample.tour.yaml"),
        documentUri: uri("mem:/sample.tour.yaml"),
      },
    };
    const listTours = {
      execute: (scope: TourScope) => {
        events.push(`list:${scope}`);
        return Promise.resolve([tour]);
      },
    } as ListTours;
    const userInterface: BrowseToursUserInterface = {
      chooseScope: () => Promise.resolve(TourScope.Repository),
      chooseTour: (tours) => Promise.resolve(tours[0]),
      openDocument: (documentUri) => {
        events.push(`open:${documentUri.toString()}`);
        return Promise.resolve();
      },
      showInformation: () => Promise.resolve(),
      showError: () => Promise.resolve(),
    };
    const logger: Logger = { info: () => undefined, error: () => undefined };

    await new BrowseToursCommand(listTours, userInterface, logger).execute();

    assert.deepEqual(events, ["list:repository", "open:mem:/sample.tour.yaml"]);
  });
});
