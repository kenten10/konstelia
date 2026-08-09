import type { TourScope } from "../../domain/tour/TourScope";
import type {
  TourStorageProvider,
  TourStorageResolver,
} from "../../application/tours/TourStorage";

export class DefaultTourStorageResolver implements TourStorageResolver {
  private readonly providers: ReadonlyMap<TourScope, TourStorageProvider>;

  public constructor(providers: readonly TourStorageProvider[]) {
    this.providers = new Map(providers.map((provider) => [provider.scope, provider]));
  }

  public resolve(scope: TourScope): TourStorageProvider {
    const provider = this.providers.get(scope);
    if (!provider) {
      throw new Error(`No tour storage provider is registered for scope '${scope}'.`);
    }
    return provider;
  }
}
