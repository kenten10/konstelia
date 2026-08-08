import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toSafeFilenameStem } from "../src/domain/tour/TourFilename";
import { findUniqueTourUri } from "../src/infrastructure/storage/TourFilename";
import { deserializeTour, serializeTour } from "../src/infrastructure/storage/TourYaml";
import { InMemoryFileSystem, uri } from "./fakes";

describe("tour YAML", () => {
  it("serializes the minimal schema defined by the specification", () => {
    const bytes = serializeTour({ id: "my-tour", title: "My Tour", steps: [] });
    const yaml = new TextDecoder().decode(bytes);

    assert.equal(yaml, "id: my-tour\ntitle: My Tour\nsteps: []\n");
    assert.deepEqual(deserializeTour(bytes), { id: "my-tour", title: "My Tour", steps: [] });
  });
});

describe("tour filenames", () => {
  it("generates safe filename stems", () => {
    assert.equal(toSafeFilenameStem("  My / First: Tour!  "), "my-first-tour");
    assert.equal(toSafeFilenameStem("認証の流れ"), "tour");
  });

  it("generates a unique URI when a filename already exists", async () => {
    const fileSystem = new InMemoryFileSystem();
    const directory = uri("mem:/tours");
    await fileSystem.writeFile(uri("mem:/tours/my-tour.tour.yaml"), new Uint8Array());
    await fileSystem.writeFile(uri("mem:/tours/my-tour-2.tour.yaml"), new Uint8Array());

    const result = await findUniqueTourUri(fileSystem, directory, "My Tour");

    assert.equal(result.toString(), "mem:/tours/my-tour-3.tour.yaml");
  });
});
