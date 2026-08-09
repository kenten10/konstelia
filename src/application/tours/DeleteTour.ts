import type { TourScope } from "../../domain/tour/TourScope";
import type { TourStorageResolver } from "./TourStorage";

export interface TourDeletionPlan {
  readonly id: string;
  readonly title: string;
  /** Tours that name this one as a prerequisite or link into it, and would be left dangling. */
  readonly referencedBy: readonly string[];
}

export interface DeleteTourUseCase {
  plan(scope: TourScope, id: string): Promise<TourDeletionPlan>;
  execute(scope: TourScope, id: string): Promise<void>;
}

export class DeleteTour implements DeleteTourUseCase {
  public constructor(private readonly storageResolver: TourStorageResolver) {}

  public async plan(scope: TourScope, id: string): Promise<TourDeletionPlan> {
    const files = await this.storageResolver.resolve(scope).scanTours();
    const target = files.find((file) => file.tour?.id === id)?.tour;
    if (!target) {
      throw new Error(`Tour '${id}' was not found in ${scope} storage.`);
    }
    const referencedBy = files.flatMap((file) => {
      const tour = file.tour;
      if (!tour || tour.id === id) {
        return [];
      }
      const references = (tour.prerequisites ?? []).includes(id)
        || tour.steps.some((step) => (step.links ?? []).some((link) => link.to.startsWith(`${id}#`)));
      return references ? [tour.id] : [];
    });
    return { id, title: target.title, referencedBy };
  }

  public async execute(scope: TourScope, id: string): Promise<void> {
    await this.storageResolver.resolve(scope).deleteTour(id);
  }
}
