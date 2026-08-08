import { ResolveAnchor } from "../anchors/ResolveAnchor";
import type { SemanticAnchorAdapter } from "../anchors/SemanticAnchorAdapter";
import { AnchorHealth, type TourAnchor } from "../../domain/tour/TourAnchor";
import type { TourDocument } from "../../domain/tour/TourDocument";
import {
  validateTourCatalog,
  type TourValidationIssue,
} from "../../domain/tour/TourValidation";
import { assessTourAnchors, type AnchorAssessment } from "./AssessTourAnchors";

export interface TourProjectFile {
  readonly file: string;
  readonly tour?: TourDocument;
  readonly issues: readonly TourValidationIssue[];
}

export interface TourProjectInput {
  readonly root: string;
  readonly tours: readonly TourProjectFile[];
  readonly anchors: readonly TourAnchor[];
  readonly projectIssues?: readonly TourProjectIssue[];
  readonly readSource: (relativeFile: string) => Promise<string>;
}

export interface TourProjectIssue {
  readonly file: string;
  readonly message: string;
  readonly path?: string;
}

export interface AnchorValidationResult {
  readonly id: string;
  readonly file: string;
  readonly health: AnchorHealth;
  readonly reason?: string;
}

export interface TourValidationResult {
  readonly file: string;
  readonly id?: string;
  readonly title?: string;
  readonly health: AnchorHealth;
  readonly issues: readonly TourProjectIssue[];
}

export interface TourProjectValidationReport {
  readonly root: string;
  readonly health: AnchorHealth;
  readonly tours: readonly TourValidationResult[];
  readonly anchors: readonly AnchorValidationResult[];
  readonly issues: readonly TourProjectIssue[];
}

export class ValidateTourProject {
  private readonly resolveAnchor: ResolveAnchor;

  public constructor(adapter: SemanticAnchorAdapter) {
    this.resolveAnchor = new ResolveAnchor(adapter);
  }

  public async execute(input: TourProjectInput): Promise<TourProjectValidationReport> {
    const projectIssues = [...(input.projectIssues ?? [])];
    const sourceCache = new Map<string, Promise<string>>();
    const anchorResults = await Promise.all(input.anchors.map(async (anchor) => {
      try {
        const source = await cachedSource(sourceCache, anchor.file, input.readSource);
        const resolution = this.resolveAnchor.execute(anchor, source);
        return {
          id: anchor.id,
          file: anchor.file,
          health: resolution.health,
          reason: resolution.reason,
        };
      } catch (error) {
        return {
          id: anchor.id,
          file: anchor.file,
          health: AnchorHealth.Broken,
          reason: error instanceof Error ? error.message : `Could not read ${anchor.file}.`,
        };
      }
    }));
    const assessments = new Map<string, AnchorAssessment>(
      anchorResults.map((result) => [result.id, result]),
    );
    const validTours = input.tours.flatMap((entry) =>
      entry.tour ? [{ key: entry.file, tour: entry.tour }] : [],
    );
    const catalogIssues = validateTourCatalog(validTours);
    const catalogIssuesByFile = groupIssues(catalogIssues.map((issue) => ({
      file: issue.key,
      path: issue.path,
      message: issue.message,
    })));
    const tourResults = input.tours.map((entry): TourValidationResult => {
      // A document that does not satisfy the schema or the catalog rules cannot be read at all.
      const documentIssues: TourProjectIssue[] = [
        ...entry.issues.map((issue) => ({ file: entry.file, ...issue })),
        ...(catalogIssuesByFile.get(entry.file) ?? []),
      ];
      if (!entry.tour) {
        return { file: entry.file, health: AnchorHealth.Broken, issues: documentIssues };
      }
      // Anchor problems are reported, but only `assessTourAnchors` decides the health, so a
      // broken secondary stays drifted instead of blocking the tour (specification §7.3, §7.4).
      const anchorIssues = missingAnchorIssues(entry.file, entry.tour, assessments);
      const assessment = assessTourAnchors(entry.tour, assessments);
      return {
        file: entry.file,
        id: entry.tour.id,
        title: entry.tour.title,
        health: documentIssues.length > 0 ? AnchorHealth.Broken : assessment.health,
        issues: [...documentIssues, ...anchorIssues],
      };
    });
    const health = combineHealth([
      ...anchorResults.map((result) => result.health),
      ...tourResults.map((result) => result.health),
      ...(projectIssues.length > 0 ? [AnchorHealth.Broken] : []),
    ]);
    return {
      root: input.root,
      health,
      tours: tourResults,
      anchors: anchorResults,
      issues: projectIssues,
    };
  }
}

function cachedSource(
  cache: Map<string, Promise<string>>,
  file: string,
  readSource: (file: string) => Promise<string>,
): Promise<string> {
  const existing = cache.get(file);
  if (existing) {
    return existing;
  }
  const source = readSource(file);
  cache.set(file, source);
  return source;
}

function groupIssues(issues: readonly TourProjectIssue[]): ReadonlyMap<string, TourProjectIssue[]> {
  const grouped = new Map<string, TourProjectIssue[]>();
  for (const issue of issues) {
    const entries = grouped.get(issue.file) ?? [];
    entries.push(issue);
    grouped.set(issue.file, entries);
  }
  return grouped;
}

function missingAnchorIssues(
  file: string,
  tour: TourDocument,
  assessments: ReadonlyMap<string, AnchorAssessment>,
): TourProjectIssue[] {
  const issues: TourProjectIssue[] = [];
  for (const [stepIndex, step] of tour.steps.entries()) {
    for (const [hopIndex, hop] of step.hops.entries()) {
      for (const [anchorIndex, reference] of hop.anchors.entries()) {
        if (!assessments.has(reference.ref)) {
          issues.push({
            file,
            path: `steps[${stepIndex}].hops[${hopIndex}].anchors[${anchorIndex}].ref`,
            message: `Anchor '${reference.ref}' does not exist.`,
          });
        }
      }
    }
  }
  return issues;
}

function combineHealth(states: readonly AnchorHealth[]): AnchorHealth {
  if (states.includes(AnchorHealth.Broken)) return AnchorHealth.Broken;
  if (states.includes(AnchorHealth.Drifted)) return AnchorHealth.Drifted;
  return AnchorHealth.Healthy;
}
