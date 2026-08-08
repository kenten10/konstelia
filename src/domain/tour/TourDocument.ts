export interface TourAnchorReference {
  ref: string;
  emphasis: "primary" | "secondary";
}

export interface TourHop {
  summary: string;
  body?: string;
  anchors: TourAnchorReference[];
}

export interface TourLink {
  to: string;
  label: string;
}

export interface TourStep {
  id: string;
  title: string;
  hops: TourHop[];
  links?: TourLink[];
}

export interface TourDocument {
  id: string;
  title: string;
  description?: string;
  prerequisites?: string[];
  steps: TourStep[];
}

/**
 * Rebuilds a document from known fields only, dropping empty optional values. Authoring
 * surfaces send whole documents back, so serialization must not persist blank strings,
 * empty collections, or properties the schema does not define.
 */
export function normalizeTourDocument(tour: TourDocument): TourDocument {
  const description = tour.description?.trim();
  const prerequisites = (tour.prerequisites ?? [])
    .map((prerequisite) => prerequisite.trim())
    .filter((prerequisite) => prerequisite.length > 0);
  return {
    id: tour.id.trim(),
    title: tour.title.trim(),
    ...(description ? { description } : {}),
    ...(prerequisites.length > 0 ? { prerequisites } : {}),
    steps: tour.steps.map((step) => normalizeStep(step)),
  };
}

function normalizeStep(step: TourStep): TourStep {
  const links = (step.links ?? []).map((link) => ({
    to: link.to.trim(),
    label: link.label.trim(),
  }));
  return {
    id: step.id.trim(),
    title: step.title.trim(),
    hops: step.hops.map((hop) => normalizeHop(hop)),
    ...(links.length > 0 ? { links } : {}),
  };
}

function normalizeHop(hop: TourHop): TourHop {
  const body = hop.body?.replace(/\s+$/, "");
  return {
    summary: hop.summary.trim(),
    ...(body ? { body } : {}),
    anchors: hop.anchors.map((anchor) => ({
      ref: anchor.ref.trim(),
      emphasis: anchor.emphasis,
    })),
  };
}
