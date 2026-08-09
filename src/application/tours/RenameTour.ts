import type { TourDocument } from "../../domain/tour/TourDocument";
import type { TourScope } from "../../domain/tour/TourScope";
import type { TourStorageResolver } from "./TourStorage";

export interface TourRenamePlan {
  readonly id: string;
  readonly title: string;
  /** Tours that name this one as a prerequisite or link into it; their references are updated. */
  readonly referencedBy: readonly string[];
}

export interface RenameTourUseCase {
  plan(scope: TourScope, id: string): Promise<TourRenamePlan>;
  execute(scope: TourScope, id: string, nextId: string): Promise<void>;
}

/**
 * Changes a tour id and the file it lives in, and rewrites the references other tours make to
 * it. A rename that left prerequisites and links pointing at the old id would break them.
 */
export class RenameTour implements RenameTourUseCase {
  public constructor(private readonly storageResolver: TourStorageResolver) {}

  public async plan(scope: TourScope, id: string): Promise<TourRenamePlan> {
    const tours = await this.loadTours(scope);
    const target = tours.find((tour) => tour.id === id);
    if (!target) {
      throw new Error(`Tour '${id}' was not found in ${scope} storage.`);
    }
    return {
      id,
      title: target.title,
      referencedBy: tours.filter((tour) => tour.id !== id && references(tour, id)).map((tour) => tour.id),
    };
  }

  public async execute(scope: TourScope, id: string, nextId: string): Promise<void> {
    const trimmed = nextId.trim();
    if (!trimmed) {
      throw new Error("A tour id is required.");
    }
    const storage = this.storageResolver.resolve(scope);
    const tours = await this.loadTours(scope);
    const target = tours.find((tour) => tour.id === id);
    if (!target) {
      throw new Error(`Tour '${id}' was not found in ${scope} storage.`);
    }
    if (trimmed === id) {
      return;
    }
    if (tours.some((tour) => tour.id === trimmed)) {
      throw new Error(`Tour id '${trimmed}' is already used in ${scope} storage.`);
    }

    // Update the references first: a failure then leaves every tour pointing at a tour that
    // still exists, which validation accepts.
    for (const tour of tours) {
      if (tour.id !== id && references(tour, id)) {
        await storage.updateTour(retarget(tour, id, trimmed));
      }
    }
    await storage.renameTour(id, { ...target, id: trimmed });
  }

  private async loadTours(scope: TourScope): Promise<TourDocument[]> {
    const files = await this.storageResolver.resolve(scope).scanTours();
    return files.flatMap((file) => (file.tour ? [file.tour] : []));
  }
}

function references(tour: TourDocument, id: string): boolean {
  return (tour.prerequisites ?? []).includes(id)
    || tour.steps.some((step) => (step.links ?? []).some((link) => link.to.startsWith(`${id}#`)));
}

function retarget(tour: TourDocument, id: string, nextId: string): TourDocument {
  const prerequisites = (tour.prerequisites ?? []).map((value) => (value === id ? nextId : value));
  return {
    ...tour,
    ...(tour.prerequisites ? { prerequisites } : {}),
    steps: tour.steps.map((step) => ({
      ...step,
      ...(step.links
        ? {
          links: step.links.map((link) => ({
            ...link,
            to: link.to.startsWith(`${id}#`) ? `${nextId}${link.to.slice(id.length)}` : link.to,
          })),
        }
        : {}),
    })),
  };
}
