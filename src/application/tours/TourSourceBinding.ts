import type { TourScope } from "../../domain/tour/TourScope";

export interface SourceWorkspace {
  readonly uri: string;
  readonly name: string;
}

export interface TourSourceBindingStore {
  get(scope: TourScope, tourId: string): Promise<string | undefined>;
  set(scope: TourScope, tourId: string, sourceRoot: string): Promise<void>;
}
