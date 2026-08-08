import type { TourDocument } from "../../domain/tour/TourDocument";
import type { TourScope } from "../../domain/tour/TourScope";
import type { TourValidationIssue } from "../../domain/tour/TourValidation";

/** Locations are plain URI strings so that tour listing stays independent of the editor API. */
export interface TourLocation {
  scope: TourScope;
  uri: string;
  documentUri?: string;
}

export interface TourSummary {
  id: string;
  title: string;
  location: TourLocation;
}

export interface StoredTourFile {
  location: TourLocation;
  tour?: TourDocument;
  issues: readonly TourValidationIssue[];
}

export interface TourStorageProvider {
  readonly scope: TourScope;
  saveTour(tour: TourDocument): Promise<TourLocation>;
  updateTour(tour: TourDocument): Promise<TourLocation>;
  loadTour(id: string): Promise<TourDocument | undefined>;
  listTours(): Promise<TourSummary[]>;
  scanTours(): Promise<StoredTourFile[]>;
  deleteTour(id: string): Promise<void>;
}
