import type { TourScope } from "../../domain/tour/TourScope";
import type { TourSummary } from "../../infrastructure/storage/TourStorageProvider";
import type { TourStorageResolver } from "../../infrastructure/storage/TourStorageResolver";

export interface TourLister {
  execute(scope: TourScope): Promise<TourSummary[]>;
}

export class ListTours implements TourLister {
  public constructor(private readonly storageResolver: TourStorageResolver) {}

  public execute(scope: TourScope): Promise<TourSummary[]> {
    return this.storageResolver.resolve(scope).listTours();
  }
}
