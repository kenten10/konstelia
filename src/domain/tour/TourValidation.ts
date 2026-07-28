import type { TourDocument } from "./TourDocument";

export interface TourValidationIssue {
  path: string;
  message: string;
}

export interface CatalogTour {
  key: string;
  tour: TourDocument;
}

export interface TourCatalogIssue extends TourValidationIssue {
  key: string;
}

export function validateTourDocument(value: unknown): TourValidationIssue[] {
  const issues: TourValidationIssue[] = [];
  if (!isRecord(value)) {
    return [{ path: "$", message: "Tour document must be a YAML object." }];
  }

  requireNonEmptyString(value, "id", "id", issues);
  requireNonEmptyString(value, "title", "title", issues);
  optionalString(value, "description", "description", issues);
  validateStringArray(value, "prerequisites", "prerequisites", issues);

  if (!Array.isArray(value.steps)) {
    issues.push({ path: "steps", message: "steps must be an array." });
    return issues;
  }

  const stepIds = new Set<string>();
  value.steps.forEach((step, stepIndex) => {
    const path = `steps[${stepIndex}]`;
    if (!isRecord(step)) {
      issues.push({ path, message: "Each step must be an object." });
      return;
    }
    const stepId = requireNonEmptyString(step, "id", `${path}.id`, issues);
    if (stepId) {
      if (stepIds.has(stepId)) {
        issues.push({ path: `${path}.id`, message: `Duplicate step id '${stepId}'.` });
      }
      stepIds.add(stepId);
    }
    requireNonEmptyString(step, "title", `${path}.title`, issues);
    validateHops(step, path, issues);
    validateLinks(step, path, issues);
  });
  return issues;
}

export function validateTourCatalog(entries: readonly CatalogTour[]): TourCatalogIssue[] {
  const issues: TourCatalogIssue[] = [];
  const byId = new Map<string, CatalogTour[]>();
  for (const entry of entries) {
    const matches = byId.get(entry.tour.id) ?? [];
    matches.push(entry);
    byId.set(entry.tour.id, matches);
  }

  for (const [id, matches] of byId) {
    if (matches.length > 1) {
      for (const match of matches) {
        issues.push({ key: match.key, path: "id", message: `Duplicate tour id '${id}'.` });
      }
    }
  }

  for (const entry of entries) {
    for (const prerequisite of entry.tour.prerequisites ?? []) {
      if (!byId.has(prerequisite)) {
        issues.push({
          key: entry.key,
          path: "prerequisites",
          message: `Prerequisite tour '${prerequisite}' does not exist.`,
        });
      }
    }
    for (const [stepIndex, step] of entry.tour.steps.entries()) {
      for (const [linkIndex, link] of (step.links ?? []).entries()) {
        const target = parseLinkTarget(link.to);
        const targetTours = target ? byId.get(target.tourId) : undefined;
        const targetExists =
          target &&
          targetTours?.length === 1 &&
          targetTours[0]?.tour.steps.some((candidate) => candidate.id === target.stepId);
        if (!targetExists) {
          issues.push({
            key: entry.key,
            path: `steps[${stepIndex}].links[${linkIndex}].to`,
            message: `Link target '${link.to}' does not exist.`,
          });
        }
      }
    }
  }

  issues.push(...findPrerequisiteCycles(entries, byId));
  return issues;
}

function validateHops(
  step: Record<string, unknown>,
  stepPath: string,
  issues: TourValidationIssue[],
): void {
  if (!Array.isArray(step.hops)) {
    issues.push({ path: `${stepPath}.hops`, message: "hops must be an array." });
    return;
  }
  step.hops.forEach((hop, hopIndex) => {
    const path = `${stepPath}.hops[${hopIndex}]`;
    if (!isRecord(hop)) {
      issues.push({ path, message: "Each hop must be an object." });
      return;
    }
    const summary = requireNonEmptyString(hop, "summary", `${path}.summary`, issues);
    if (summary && /[\r\n]/.test(summary)) {
      issues.push({ path: `${path}.summary`, message: "summary must be a single line." });
    }
    optionalString(hop, "body", `${path}.body`, issues);
    if (!Array.isArray(hop.anchors) || hop.anchors.length === 0) {
      issues.push({ path: `${path}.anchors`, message: "anchors must contain at least one item." });
      return;
    }
    let primaryCount = 0;
    hop.anchors.forEach((anchor, anchorIndex) => {
      const anchorPath = `${path}.anchors[${anchorIndex}]`;
      if (!isRecord(anchor)) {
        issues.push({ path: anchorPath, message: "Each anchor reference must be an object." });
        return;
      }
      requireNonEmptyString(anchor, "ref", `${anchorPath}.ref`, issues);
      if (anchor.emphasis !== "primary" && anchor.emphasis !== "secondary") {
        issues.push({
          path: `${anchorPath}.emphasis`,
          message: "emphasis must be 'primary' or 'secondary'.",
        });
      }
      if (anchor.emphasis === "primary") {
        primaryCount += 1;
      }
    });
    if (primaryCount !== 1) {
      issues.push({
        path: `${path}.anchors`,
        message: `anchors must contain exactly one primary item; found ${primaryCount}.`,
      });
    }
  });
}

function validateLinks(
  step: Record<string, unknown>,
  stepPath: string,
  issues: TourValidationIssue[],
): void {
  if (step.links === undefined) {
    return;
  }
  if (!Array.isArray(step.links)) {
    issues.push({ path: `${stepPath}.links`, message: "links must be an array." });
    return;
  }
  step.links.forEach((link, linkIndex) => {
    const path = `${stepPath}.links[${linkIndex}]`;
    if (!isRecord(link)) {
      issues.push({ path, message: "Each link must be an object." });
      return;
    }
    const to = requireNonEmptyString(link, "to", `${path}.to`, issues);
    if (to && !parseLinkTarget(to)) {
      issues.push({ path: `${path}.to`, message: "Link target must use the form tourId#stepId." });
    }
    requireNonEmptyString(link, "label", `${path}.label`, issues);
  });
}

function findPrerequisiteCycles(
  entries: readonly CatalogTour[],
  byId: ReadonlyMap<string, readonly CatalogTour[]>,
): TourCatalogIssue[] {
  const issues: TourCatalogIssue[] = [];
  const state = new Map<string, "visiting" | "visited">();
  const reported = new Set<string>();

  const visit = (entry: CatalogTour, stack: string[]): void => {
    const id = entry.tour.id;
    if (state.get(id) === "visiting") {
      const cycleStart = stack.indexOf(id);
      const cycle = [...stack.slice(cycleStart), id];
      const signature = [...new Set(cycle)].sort().join("|");
      if (!reported.has(signature)) {
        reported.add(signature);
        const message = `Circular prerequisites: ${cycle.join(" -> ")}.`;
        for (const cycleId of new Set(cycle)) {
          const cycleEntry = byId.get(cycleId)?.[0];
          if (cycleEntry) {
            issues.push({ key: cycleEntry.key, path: "prerequisites", message });
          }
        }
      }
      return;
    }
    if (state.get(id) === "visited") {
      return;
    }
    state.set(id, "visiting");
    for (const prerequisite of entry.tour.prerequisites ?? []) {
      const target = byId.get(prerequisite);
      if (target?.length === 1 && target[0]) {
        visit(target[0], [...stack, id]);
      }
    }
    state.set(id, "visited");
  };

  for (const entry of entries) {
    visit(entry, []);
  }
  return issues;
}

function parseLinkTarget(value: string): { tourId: string; stepId: string } | undefined {
  const match = /^([^#]+)#([^#]+)$/.exec(value);
  return match?.[1] && match[2] ? { tourId: match[1], stepId: match[2] } : undefined;
}

function validateStringArray(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: TourValidationIssue[],
): void {
  const value = record[key];
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    issues.push({ path, message: `${key} must be an array of non-empty strings.` });
  }
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: TourValidationIssue[],
): void {
  if (record[key] !== undefined && typeof record[key] !== "string") {
    issues.push({ path, message: `${key} must be a string.` });
  }
}

function requireNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: TourValidationIssue[],
): string | undefined {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    issues.push({ path, message: `${key} must be a non-empty string.` });
    return undefined;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
