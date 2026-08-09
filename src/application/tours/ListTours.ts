import type { TourScope } from "../../domain/tour/TourScope";
import type { TourSummary } from "./TourStorage";
import type { TourStorageResolver } from "./TourStorage";

export interface TourLister {
  execute(scope: TourScope): Promise<TourSummary[]>;
}

export class ListTours implements TourLister {
  public constructor(private readonly storageResolver: TourStorageResolver) {}

  public execute(scope: TourScope): Promise<TourSummary[]> {
    return this.storageResolver.resolve(scope).listTours();
  }
}
