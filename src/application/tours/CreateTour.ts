import type { TourDocument } from "../../domain/tour/TourDocument";
import type { TourScope } from "../../domain/tour/TourScope";
import { toSafeFilenameStem } from "../../domain/tour/TourFilename";
import type { TourLocation } from "./TourStorage";
import type { TourStorageResolver } from "./TourStorage";

export interface CreateTourInput {
  scope: TourScope;
  title: string;
}

export interface CreateTourResult {
  tour: TourDocument;
  location: TourLocation;
}

export interface CreateTourUseCase {
  execute(input: CreateTourInput): Promise<CreateTourResult>;
}

export class CreateTour implements CreateTourUseCase {
  public constructor(private readonly storageResolver: TourStorageResolver) {}

  public async execute(input: CreateTourInput): Promise<CreateTourResult> {
    const title = input.title.trim();
    if (!title) {
      throw new Error("Tour title is required.");
    }
    const storage = this.storageResolver.resolve(input.scope);
    const existingIds = new Set((await storage.listTours()).map((tour) => tour.id));
    const id = uniqueId(toSafeFilenameStem(title), existingIds);
    const tour: TourDocument = { id, title, steps: [] };
    const location = await storage.saveTour(tour);
    return { tour, location };
  }
}

function uniqueId(preferredId: string, existingIds: ReadonlySet<string>): string {
  let suffix = 1;
  while (true) {
    const candidate = suffix === 1 ? preferredId : `${preferredId}-${suffix}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
    suffix += 1;
  }
}
