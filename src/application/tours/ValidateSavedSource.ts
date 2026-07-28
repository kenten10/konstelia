import { ResolveAnchor, type AnchorResolution } from "../anchors/ResolveAnchor";
import type { TourSourceBindingStore } from "./TourSourceBinding";
import { TourReferenceIndex, type TourAnchorUsage } from "./TourReferenceIndex";
import type { SemanticAnchorAdapter, AnchorOffsetRange } from "../anchors/SemanticAnchorAdapter";
import { AnchorHealth } from "../../domain/tour/TourAnchor";
import type { TourDocument } from "../../domain/tour/TourDocument";
import { TourScope } from "../../domain/tour/TourScope";
import type { TourStorageResolver } from "../../infrastructure/storage/TourStorageResolver";
import type { TourAnchorRegistryResolver } from "./TourAnchorRegistry";

export interface ValidateSavedSourceInput {
  readonly scope: TourScope;
  readonly file: string;
  readonly sourceText: string;
  readonly sourceRoot: string;
}

export interface SavedSourceAnchorIssue {
  readonly scope: TourScope;
  readonly anchorId: string;
  readonly health: AnchorHealth.Drifted | AnchorHealth.Broken;
  readonly blocksPlayback: boolean;
  readonly reason?: string;
  readonly range?: AnchorOffsetRange;
  readonly usages: readonly TourAnchorUsage[];
}

export interface SavedSourceValidation {
  readonly checkedAnchors: number;
  readonly issues: readonly SavedSourceAnchorIssue[];
}

export class ValidateSavedSource {
  private readonly resolveAnchor: ResolveAnchor;

  public constructor(
    private readonly storageResolver: TourStorageResolver,
    private readonly anchorRegistryResolver: TourAnchorRegistryResolver,
    private readonly sourceBindings: TourSourceBindingStore,
    adapter: SemanticAnchorAdapter,
  ) {
    this.resolveAnchor = new ResolveAnchor(adapter);
  }

  public async execute(input: ValidateSavedSourceInput): Promise<SavedSourceValidation> {
    const storedTours = await this.storageResolver.resolve(input.scope).scanTours();
    const tours = storedTours.flatMap((stored) => stored.tour ? [stored.tour] : []);
    const applicableTours = input.scope === TourScope.Personal
      ? await this.filterPersonalTours(tours, input.sourceRoot)
      : tours;
    const anchors = await this.anchorRegistryResolver.resolve(input.scope).loadAnchors();
    const indexedAnchors = new TourReferenceIndex(anchors, applicableTours).forFile(input.file);
    const issues = indexedAnchors.flatMap(({ anchor, usages }) => {
      const resolution = this.resolveAnchor.execute(anchor, input.sourceText);
      return resolution.health === AnchorHealth.Healthy
        ? []
        : [toIssue(input.scope, anchor.id, usages, resolution)];
    });
    return { checkedAnchors: indexedAnchors.length, issues };
  }

  private async filterPersonalTours(
    tours: readonly TourDocument[],
    sourceRoot: string,
  ): Promise<readonly TourDocument[]> {
    const applicable = await Promise.all(tours.map(async (tour) => ({
      tour,
      sourceRoot: await this.sourceBindings.get(TourScope.Personal, tour.id),
    })));
    return applicable
      .filter((entry) => entry.sourceRoot === sourceRoot)
      .map((entry) => entry.tour);
  }
}

function toIssue(
  scope: TourScope,
  anchorId: string,
  usages: readonly TourAnchorUsage[],
  resolution: AnchorResolution,
): SavedSourceAnchorIssue {
  const health = resolution.health === AnchorHealth.Broken
    ? AnchorHealth.Broken
    : AnchorHealth.Drifted;
  return {
    scope,
    anchorId,
    health,
    blocksPlayback:
      health === AnchorHealth.Broken && usages.some((usage) => usage.emphasis === "primary"),
    reason: resolution.reason,
    range: resolution.range,
    usages,
  };
}
