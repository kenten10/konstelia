import { TourScope } from "../../domain/tour/TourScope";
import type { TourStorageResolver } from "../tours/TourStorage";
import type { TourAnchorRegistryResolver } from "../tours/TourAnchorRegistry";
import { TourReferenceIndex } from "../tours/TourReferenceIndex";
import type { TourSourceBindingStore } from "../tours/TourSourceBinding";

export interface AnchorRepairAuthorizer {
  assertAllowed(scope: TourScope, anchorId: string, currentSourceRoot?: string): Promise<void>;
}

export class AuthorizeAnchorRepair implements AnchorRepairAuthorizer {
  public constructor(
    private readonly storageResolver: TourStorageResolver,
    private readonly registryResolver: TourAnchorRegistryResolver,
    private readonly sourceBindings: TourSourceBindingStore,
  ) {}

  public async assertAllowed(
    scope: TourScope,
    anchorId: string,
    currentSourceRoot?: string,
  ): Promise<void> {
    if (scope !== TourScope.Personal) return;
    if (!currentSourceRoot) {
      throw new Error("Personal anchor repair requires an open source workspace.");
    }

    const [storedTours, anchors] = await Promise.all([
      this.storageResolver.resolve(scope).scanTours(),
      this.registryResolver.resolve(scope).loadAnchors(),
    ]);
    const tours = storedTours.flatMap((stored) => stored.tour ? [stored.tour] : []);
    const indexed = new TourReferenceIndex(anchors, tours).forAnchor(anchorId);
    if (!indexed) return;

    const tourIds = [...new Set(indexed.usages.map((usage) => usage.tourId))];
    const bindings = await Promise.all(tourIds.map(async (tourId) => ({
      tourId,
      sourceRoot: await this.sourceBindings.get(scope, tourId),
    })));
    const unbound = bindings.filter((binding) => !binding.sourceRoot).map((binding) => binding.tourId);
    if (unbound.length > 0) {
      throw new Error(
        `Personal anchor '${anchorId}' is referenced by unbound tour(s): ${unbound.join(", ")}. ` +
        "Play and bind those tours before repairing the anchor.",
      );
    }
    const sourceRoots = new Set(bindings.flatMap((binding) => binding.sourceRoot ? [binding.sourceRoot] : []));
    if (sourceRoots.size > 1) {
      throw new Error(
        `Personal anchor '${anchorId}' is shared by tours bound to different source workspaces. ` +
        "Create separate anchors before repairing it.",
      );
    }
    const [boundRoot] = sourceRoots;
    if (boundRoot && boundRoot !== currentSourceRoot) {
      throw new Error(
        `Personal anchor '${anchorId}' belongs to source workspace '${boundRoot}', ` +
        `not the currently open workspace '${currentSourceRoot}'.`,
      );
    }
  }
}
