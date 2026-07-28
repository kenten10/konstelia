import type { TourDocument } from "../../domain/tour/TourDocument";
import type { TourScope } from "../../domain/tour/TourScope";
import type { TourStorageResolver } from "../../infrastructure/storage/TourStorageResolver";

export class LoadTour {
  public constructor(private readonly storageResolver: TourStorageResolver) {}

  public execute(scope: TourScope, id: string): Promise<TourDocument | undefined> {
    return this.storageResolver.resolve(scope).loadTour(id);
  }
}
