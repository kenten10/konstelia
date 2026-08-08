import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { parse } from "yaml";
import { ResolveAnchor } from "../src/application/anchors/ResolveAnchor";
import { AnchorHealth, type TourAnchor } from "../src/domain/tour/TourAnchor";
import type { TourDocument } from "../src/domain/tour/TourDocument";
import { validateTourCatalog, validateTourDocument } from "../src/domain/tour/TourValidation";
import { DefaultSemanticAnchorAdapter } from "../src/infrastructure/language/DefaultSemanticAnchorAdapter";

const repositoryRoot = process.cwd();

describe("bundled repository tours", () => {
  it("keeps every tour, reference, and semantic anchor valid", () => {
    const tourDirectory = path.join(repositoryRoot, ".konstelia", "tours");
    const entries = readdirSync(tourDirectory)
      .filter((name) => name.endsWith(".tour.yaml"))
      .map((name) => {
        const tour = parse(readFileSync(path.join(tourDirectory, name), "utf8")) as TourDocument;
        assert.deepEqual(validateTourDocument(tour), [], name);
        return { key: name, tour };
      });
    assert.deepEqual(validateTourCatalog(entries), []);

    const registry = parse(
      readFileSync(path.join(repositoryRoot, ".konstelia", "anchors.yaml"), "utf8"),
    ) as { anchors: TourAnchor[] };
    const anchorsById = new Map(registry.anchors.map((anchor) => [anchor.id, anchor]));
    for (const { tour } of entries) {
      for (const step of tour.steps) {
        for (const hop of step.hops) {
          for (const reference of hop.anchors) {
            assert.ok(anchorsById.has(reference.ref), `Missing anchor '${reference.ref}'.`);
          }
        }
      }
    }

    const resolver = new ResolveAnchor(new DefaultSemanticAnchorAdapter());
    for (const anchor of registry.anchors) {
      const source = readFileSync(path.join(repositoryRoot, anchor.file), "utf8");
      const resolution = resolver.execute(anchor, source);
      assert.equal(resolution.health, AnchorHealth.Healthy, `${anchor.id}: ${resolution.reason}`);
    }
  });

  it("includes a repository tour for every supported language family", () => {
    const tours = readdirSync(path.join(repositoryRoot, ".konstelia", "tours"))
      .filter((name) => name.endsWith(".tour.yaml"))
      .map((name) => parse(
        readFileSync(path.join(repositoryRoot, ".konstelia", "tours", name), "utf8"),
      ) as TourDocument);
    const registry = parse(
      readFileSync(path.join(repositoryRoot, ".konstelia", "anchors.yaml"), "utf8"),
    ) as { anchors: TourAnchor[] };
    const anchorsById = new Map(registry.anchors.map((anchor) => [anchor.id, anchor]));
    const coveredExtensions = new Set(
      tours.flatMap((tour) => tour.steps)
        .flatMap((step) => step.hops)
        .flatMap((hop) => hop.anchors)
        .map((reference) => anchorsById.get(reference.ref)?.file)
        .filter((file): file is string => file !== undefined)
        .map((file) => path.extname(file)),
    );

    assert.deepEqual(
      [...coveredExtensions].sort(),
      [".c", ".cpp", ".cs", ".go", ".java", ".js", ".kt", ".py", ".rb", ".rs", ".swift", ".ts"],
    );
  });

  it("keeps the shipped samples pointing only at shipped source files", () => {
    // `.vscodeignore` excludes src/** and every repository tour except the sample, so anything
    // the extension can play after installation must reference examples/ only.
    const registry = parse(
      readFileSync(path.join(repositoryRoot, ".konstelia", "anchors.yaml"), "utf8"),
    ) as { anchors: TourAnchor[] };
    const anchorsById = new Map(registry.anchors.map((anchor) => [anchor.id, anchor]));
    const shipped = [
      path.join(repositoryRoot, ".konstelia", "tours", "sample-tour.tour.yaml"),
      ...readdirSync(path.join(repositoryRoot, "samples", "tours"))
        .filter((name) => name.endsWith(".tour.yaml"))
        .map((name) => path.join(repositoryRoot, "samples", "tours", name)),
    ];

    for (const file of shipped) {
      const tour = parse(readFileSync(file, "utf8")) as TourDocument;
      for (const step of tour.steps) {
        for (const hop of step.hops) {
          for (const reference of hop.anchors) {
            const anchor = anchorsById.get(reference.ref);
            assert.ok(anchor, `${path.basename(file)}: missing anchor '${reference.ref}'.`);
            assert.ok(
              anchor.file.startsWith("examples/"),
              `${path.basename(file)}: anchor '${anchor.id}' points at '${anchor.file}', which is not shipped.`,
            );
          }
        }
      }
    }
  });

  it("keeps all scoped sample templates valid and resolvable", () => {
    const templateDirectory = path.join(repositoryRoot, "samples", "tours");
    const registry = parse(
      readFileSync(path.join(repositoryRoot, ".konstelia", "anchors.yaml"), "utf8"),
    ) as { anchors: TourAnchor[] };
    const anchorsById = new Map(registry.anchors.map((anchor) => [anchor.id, anchor]));
    const resolver = new ResolveAnchor(new DefaultSemanticAnchorAdapter());

    for (const name of readdirSync(templateDirectory).filter((file) => file.endsWith(".tour.yaml"))) {
      const tour = parse(readFileSync(path.join(templateDirectory, name), "utf8")) as TourDocument;
      assert.deepEqual(validateTourDocument(tour), [], name);
      for (const step of tour.steps) {
        for (const hop of step.hops) {
          for (const reference of hop.anchors) {
            const anchor = anchorsById.get(reference.ref);
            assert.ok(anchor, `${name}: missing anchor '${reference.ref}'.`);
            const source = readFileSync(path.join(repositoryRoot, anchor.file), "utf8");
            assert.equal(
              resolver.execute(anchor, source).health,
              AnchorHealth.Healthy,
              `${name}: ${anchor.id}`,
            );
          }
        }
      }
    }
  });
});
