import { AnchorHealth } from "./TourAnchor";
import type { TourAnchorReference, TourDocument } from "./TourDocument";

export interface TourFlowNode {
  readonly id: string;
  readonly stepIndex: number;
  readonly hopIndex: number;
  readonly ordinal: number;
  readonly summary: string;
  readonly hasBody: boolean;
  readonly anchors: readonly TourAnchorReference[];
  readonly health: AnchorHealth;
}

export type TourFlowEdgeKind = "hop" | "step";

export interface TourFlowEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: TourFlowEdgeKind;
}

export interface TourFlowGroup {
  readonly stepIndex: number;
  readonly stepId: string;
  readonly title: string;
  readonly nodeIds: readonly string[];
  readonly linkIds: readonly string[];
}

export interface TourFlowLink {
  readonly id: string;
  readonly stepIndex: number;
  readonly label: string;
  readonly target: string;
}

export interface TourFlowDiagram {
  readonly tourId: string;
  readonly title: string;
  readonly groups: readonly TourFlowGroup[];
  readonly nodes: readonly TourFlowNode[];
  readonly edges: readonly TourFlowEdge[];
  readonly links: readonly TourFlowLink[];
}

export interface TourFlowDiagramOptions {
  /** Health per anchor id. Anchors that are absent from the map count as healthy. */
  readonly anchorHealth?: ReadonlyMap<string, AnchorHealth>;
}

export function tourFlowNodeId(stepIndex: number, hopIndex: number): string {
  return `${stepIndex}:${hopIndex}`;
}

/** Reads back an id produced by {@link tourFlowNodeId}; returns undefined for anything else. */
export function parseTourFlowNodeId(
  value: string,
): { stepIndex: number; hopIndex: number } | undefined {
  const match = /^(\d+):(\d+)$/.exec(value);
  const step = match?.[1];
  const hop = match?.[2];
  if (step === undefined || hop === undefined) {
    return undefined;
  }
  return { stepIndex: Number(step), hopIndex: Number(hop) };
}

/**
 * Projects a tour into the graph the flow diagram renders. The result depends only on the
 * document and the supplied anchor health, so the same diagram can be built while editing,
 * while browsing, and while playing a tour.
 */
export function buildTourFlowDiagram(
  tour: TourDocument,
  options: TourFlowDiagramOptions = {},
): TourFlowDiagram {
  const nodes: TourFlowNode[] = [];
  const groups: TourFlowGroup[] = [];
  const links: TourFlowLink[] = [];

  for (const [stepIndex, step] of tour.steps.entries()) {
    const nodeIds: string[] = [];
    for (const [hopIndex, hop] of step.hops.entries()) {
      const id = tourFlowNodeId(stepIndex, hopIndex);
      nodeIds.push(id);
      nodes.push({
        id,
        stepIndex,
        hopIndex,
        ordinal: nodes.length,
        summary: hop.summary,
        hasBody: Boolean(hop.body?.trim()),
        anchors: hop.anchors,
        health: worstHealth(hop.anchors, options.anchorHealth),
      });
    }
    const linkIds: string[] = [];
    for (const [linkIndex, link] of (step.links ?? []).entries()) {
      const id = `link:${stepIndex}:${linkIndex}`;
      linkIds.push(id);
      links.push({ id, stepIndex, label: link.label, target: link.to });
    }
    groups.push({ stepIndex, stepId: step.id, title: step.title, nodeIds, linkIds });
  }

  const edges: TourFlowEdge[] = [];
  for (let index = 1; index < nodes.length; index += 1) {
    const from = nodes[index - 1];
    const to = nodes[index];
    if (!from || !to) {
      continue;
    }
    edges.push({
      from: from.id,
      to: to.id,
      kind: from.stepIndex === to.stepIndex ? "hop" : "step",
    });
  }

  return { tourId: tour.id, title: tour.title, groups, nodes, edges, links };
}

function worstHealth(
  anchors: readonly TourAnchorReference[],
  anchorHealth: ReadonlyMap<string, AnchorHealth> | undefined,
): AnchorHealth {
  if (!anchorHealth) {
    return AnchorHealth.Healthy;
  }
  let worst = AnchorHealth.Healthy;
  for (const anchor of anchors) {
    const health = anchorHealth.get(anchor.ref) ?? AnchorHealth.Healthy;
    if (health === AnchorHealth.Broken) {
      return AnchorHealth.Broken;
    }
    if (health === AnchorHealth.Drifted) {
      worst = AnchorHealth.Drifted;
    }
  }
  return worst;
}
