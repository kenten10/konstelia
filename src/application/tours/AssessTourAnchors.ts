import { missingAnchorMessage } from "../../domain/tour/TourValidation";
import { AnchorHealth } from "../../domain/tour/TourAnchor";
import type { TourDocument } from "../../domain/tour/TourDocument";

export interface AnchorAssessment {
  readonly health: AnchorHealth;
  readonly reason?: string;
}

export interface TourAnchorIssue extends AnchorAssessment {
  readonly anchorId: string;
  readonly stepId: string;
  readonly hopIndex: number;
  readonly emphasis: "primary" | "secondary";
}

export interface TourAnchorAssessment {
  readonly health: AnchorHealth;
  readonly blockingIssues: readonly TourAnchorIssue[];
  readonly warnings: readonly TourAnchorIssue[];
}

export function assessTourAnchors(
  tour: TourDocument,
  anchors: ReadonlyMap<string, AnchorAssessment>,
): TourAnchorAssessment {
  const blockingIssues: TourAnchorIssue[] = [];
  const warnings: TourAnchorIssue[] = [];
  let hasDrift = false;

  for (const step of tour.steps) {
    for (const [hopIndex, hop] of step.hops.entries()) {
      for (const reference of hop.anchors) {
        const assessment = anchors.get(reference.ref) ?? {
          health: AnchorHealth.Broken,
          reason: missingAnchorMessage(reference.ref),
        };
        if (assessment.health === AnchorHealth.Healthy) {
          continue;
        }
        if (assessment.health === AnchorHealth.Drifted) {
          hasDrift = true;
          continue;
        }
        const issue: TourAnchorIssue = {
          anchorId: reference.ref,
          stepId: step.id,
          hopIndex,
          emphasis: reference.emphasis,
          ...assessment,
        };
        if (reference.emphasis === "primary") {
          blockingIssues.push(issue);
        } else {
          warnings.push(issue);
          hasDrift = true;
        }
      }
    }
  }

  return {
    health:
      blockingIssues.length > 0
        ? AnchorHealth.Broken
        : hasDrift
          ? AnchorHealth.Drifted
          : AnchorHealth.Healthy,
    blockingIssues,
    warnings,
  };
}
