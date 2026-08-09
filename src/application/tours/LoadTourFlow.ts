import type { SemanticAnchorAdapter } from "../anchors/SemanticAnchorAdapter";
import { AnchorHealth } from "../../domain/tour/TourAnchor";
import type { TourDocument } from "../../domain/tour/TourDocument";
import type { TourScope } from "../../domain/tour/TourScope";
import type { TourStorageResolver } from "./TourStorage";
import type { TourSourceReader } from "./ListToursWithHealth";
import type { TourAnchorRegistryResolver } from "./TourAnchorRegistry";
import { ValidateTourProject } from "./ValidateTourProject";

export interface TourFlowSnapshot {
  readonly tour: TourDocument;
  readonly anchorHealth: ReadonlyMap<string, AnchorHealth>;
}

export interface LoadTourFlowUseCase {
  execute(scope: TourScope, id: string): Promise<TourFlowSnapshot>;
}

/**
 * Loads a tour together with the health of the anchors it references, so the flow diagram shows
 * the same three states the catalog and the CLI report. Only referenced anchors are resolved.
 */
export class LoadTourFlow implements LoadTourFlowUseCase {
  private readonly validator: ValidateTourProject;

  public constructor(
    private readonly storageResolver: TourStorageResolver,
    private readonly anchorRegistryResolver: TourAnchorRegistryResolver,
    private readonly sourceReader: TourSourceReader,
    adapter: SemanticAnchorAdapter,
  ) {
    this.validator = new ValidateTourProject(adapter);
  }

  public async execute(scope: TourScope, id: string): Promise<TourFlowSnapshot> {
    const tour = await this.storageResolver.resolve(scope).loadTour(id);
    if (!tour) {
      throw new Error(`Tour '${id}' was not found in ${scope} storage.`);
    }
    const referenced = new Set(
      tour.steps.flatMap((step) =>
        step.hops.flatMap((hop) => hop.anchors.map((reference) => reference.ref)),
      ),
    );
    const anchors = (await this.anchorRegistryResolver.resolve(scope).loadAnchors())
      .filter((anchor) => referenced.has(anchor.id));
    const report = await this.validator.execute({
      root: scope,
      tours: [{ file: id, tour, issues: [] }],
      anchors,
      readSource: (file) => this.sourceReader.readSource(file),
    });
    const anchorHealth = new Map(report.anchors.map((anchor) => [anchor.id, anchor.health]));
    for (const reference of referenced) {
      if (!anchorHealth.has(reference)) {
        anchorHealth.set(reference, AnchorHealth.Broken);
      }
    }
    return { tour, anchorHealth };
  }
}
