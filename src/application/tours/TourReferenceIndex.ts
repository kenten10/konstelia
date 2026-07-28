import type { TourAnchor } from "../../domain/tour/TourAnchor";
import type { TourDocument } from "../../domain/tour/TourDocument";

export interface TourAnchorUsage {
  readonly tourId: string;
  readonly tourTitle: string;
  readonly stepId: string;
  readonly hopIndex: number;
  readonly emphasis: "primary" | "secondary";
}

export interface IndexedTourAnchor {
  readonly anchor: TourAnchor;
  readonly usages: readonly TourAnchorUsage[];
}

export class TourReferenceIndex {
  private readonly anchorsByFile = new Map<string, IndexedTourAnchor[]>();
  private readonly anchorsById = new Map<string, IndexedTourAnchor>();

  public constructor(anchors: readonly TourAnchor[], tours: readonly TourDocument[]) {
    const usagesByAnchor = indexUsages(tours);
    for (const anchor of anchors) {
      const usages = usagesByAnchor.get(anchor.id);
      if (!usages || usages.length === 0) {
        continue;
      }
      const file = normalizeRelativeFile(anchor.file);
      const indexed = this.anchorsByFile.get(file) ?? [];
      const entry = { anchor, usages };
      indexed.push(entry);
      this.anchorsByFile.set(file, indexed);
      this.anchorsById.set(anchor.id, entry);
    }
  }

  public forFile(file: string): readonly IndexedTourAnchor[] {
    return this.anchorsByFile.get(normalizeRelativeFile(file)) ?? [];
  }

  public forAnchor(anchorId: string): IndexedTourAnchor | undefined {
    return this.anchorsById.get(anchorId);
  }
}

function indexUsages(tours: readonly TourDocument[]): ReadonlyMap<string, TourAnchorUsage[]> {
  const usages = new Map<string, TourAnchorUsage[]>();
  for (const tour of tours) {
    for (const step of tour.steps) {
      for (const [hopIndex, hop] of step.hops.entries()) {
        for (const reference of hop.anchors) {
          const entries = usages.get(reference.ref) ?? [];
          entries.push({
            tourId: tour.id,
            tourTitle: tour.title,
            stepId: step.id,
            hopIndex,
            emphasis: reference.emphasis,
          });
          usages.set(reference.ref, entries);
        }
      }
    }
  }
  return usages;
}

function normalizeRelativeFile(file: string): string {
  return file.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}
