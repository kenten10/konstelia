import type { TourAnchor } from "../../domain/tour/TourAnchor";
import type { TourScope } from "../../domain/tour/TourScope";

export interface TourAnchorRegistry {
  readonly scope: TourScope;
  loadAnchors(): Promise<TourAnchor[]>;
  saveAnchor(anchor: TourAnchor): Promise<void>;
  replaceAnchor(anchor: TourAnchor): Promise<void>;
}

export interface TourAnchorRegistryResolver {
  resolve(scope: TourScope): TourAnchorRegistry;
}

export class DefaultTourAnchorRegistryResolver implements TourAnchorRegistryResolver {
  private readonly registries: ReadonlyMap<TourScope, TourAnchorRegistry>;

  public constructor(registries: readonly TourAnchorRegistry[]) {
    this.registries = new Map(registries.map((registry) => [registry.scope, registry]));
  }

  public resolve(scope: TourScope): TourAnchorRegistry {
    const registry = this.registries.get(scope);
    if (!registry) {
      throw new Error(`No anchor registry is registered for scope '${scope}'.`);
    }
    return registry;
  }
}
