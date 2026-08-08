import type { TourScope } from "../../domain/tour/TourScope";
import type { TourAnchorRegistryResolver } from "../tours/TourAnchorRegistry";

export interface TourAnchorChoice {
  readonly id: string;
  readonly file: string;
  readonly symbol: string;
}

export interface AnchorLister {
  execute(scope: TourScope): Promise<TourAnchorChoice[]>;
}

/** The anchors an authoring surface can offer, in the order an author reads them. */
export class ListAnchors implements AnchorLister {
  public constructor(private readonly anchorRegistryResolver: TourAnchorRegistryResolver) {}

  public async execute(scope: TourScope): Promise<TourAnchorChoice[]> {
    const anchors = await this.anchorRegistryResolver.resolve(scope).loadAnchors();
    return anchors
      .map((anchor) => ({ id: anchor.id, file: anchor.file, symbol: anchor.symbol }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }
}
