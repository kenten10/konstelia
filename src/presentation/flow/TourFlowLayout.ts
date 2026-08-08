import type {
  TourFlowDiagram,
  TourFlowEdgeKind,
  TourFlowLink,
  TourFlowNode,
} from "../../domain/tour/TourFlowDiagram";

export interface FlowPoint {
  readonly x: number;
  readonly y: number;
}

export interface FlowRect extends FlowPoint {
  readonly width: number;
  readonly height: number;
}

export interface FlowNodeBox extends FlowRect {
  readonly id: string;
  readonly node: TourFlowNode;
}

export interface FlowLinkBox extends FlowRect {
  readonly id: string;
  readonly link: TourFlowLink;
}

export interface FlowGroupBox extends FlowRect {
  readonly stepIndex: number;
  readonly stepId: string;
  readonly title: string;
}

export type FlowEdgeKind = TourFlowEdgeKind | "link";

export interface FlowEdgeLine {
  readonly from: string;
  readonly to: string;
  readonly kind: FlowEdgeKind;
  readonly points: readonly FlowPoint[];
}

export interface TourFlowLayout {
  readonly width: number;
  readonly height: number;
  readonly groups: readonly FlowGroupBox[];
  readonly nodes: readonly FlowNodeBox[];
  readonly links: readonly FlowLinkBox[];
  readonly edges: readonly FlowEdgeLine[];
}

export const flowLayoutMetrics = {
  canvasPadding: 16,
  nodeWidth: 208,
  nodeHeight: 78,
  columnGap: 36,
  rowGap: 26,
  maxColumns: 3,
  groupPaddingX: 16,
  groupHeaderHeight: 34,
  groupPaddingBottom: 16,
  groupGap: 28,
  emptyGroupHeight: 44,
  linkHeight: 28,
} as const;

/**
 * Places a flow diagram on a fixed grid: one lane per step, hops flowing left to right and
 * wrapping after `maxColumns`. The geometry is pure so the same layout can be rendered to SVG
 * in a webview and asserted in unit tests.
 */
export function layoutTourFlowDiagram(diagram: TourFlowDiagram): TourFlowLayout {
  const metrics = flowLayoutMetrics;
  const nodesById = new Map(diagram.nodes.map((node) => [node.id, node]));
  const linksById = new Map(diagram.links.map((link) => [link.id, link]));
  const widestGroup = diagram.groups.reduce(
    (widest, group) => Math.max(widest, group.nodeIds.length, group.linkIds.length),
    1,
  );
  const columns = Math.min(metrics.maxColumns, Math.max(1, widestGroup));
  const innerWidth = columns * metrics.nodeWidth + (columns - 1) * metrics.columnGap;
  const groupWidth = innerWidth + metrics.groupPaddingX * 2;

  const groups: FlowGroupBox[] = [];
  const nodes: FlowNodeBox[] = [];
  const links: FlowLinkBox[] = [];
  const groupX = metrics.canvasPadding;
  let cursorY = metrics.canvasPadding;

  for (const group of diagram.groups) {
    const contentTop = cursorY + metrics.groupHeaderHeight;
    const nodeRows = rowCount(group.nodeIds.length, columns);
    const nodesHeight = nodeRows === 0
      ? metrics.emptyGroupHeight
      : nodeRows * metrics.nodeHeight + (nodeRows - 1) * metrics.rowGap;

    group.nodeIds.forEach((id, index) => {
      const node = nodesById.get(id);
      if (!node) {
        return;
      }
      nodes.push({
        id,
        node,
        width: metrics.nodeWidth,
        height: metrics.nodeHeight,
        x: groupX + metrics.groupPaddingX + (index % columns) * (metrics.nodeWidth + metrics.columnGap),
        y: contentTop + Math.floor(index / columns) * (metrics.nodeHeight + metrics.rowGap),
      });
    });

    const linkRows = rowCount(group.linkIds.length, columns);
    const linksTop = contentTop + nodesHeight + (linkRows > 0 ? metrics.rowGap : 0);
    group.linkIds.forEach((id, index) => {
      const link = linksById.get(id);
      if (!link) {
        return;
      }
      links.push({
        id,
        link,
        width: metrics.nodeWidth,
        height: metrics.linkHeight,
        x: groupX + metrics.groupPaddingX + (index % columns) * (metrics.nodeWidth + metrics.columnGap),
        y: linksTop + Math.floor(index / columns) * (metrics.linkHeight + metrics.rowGap),
      });
    });
    const linksHeight = linkRows === 0
      ? 0
      : metrics.rowGap + linkRows * metrics.linkHeight + (linkRows - 1) * metrics.rowGap;

    const height = metrics.groupHeaderHeight + nodesHeight + linksHeight + metrics.groupPaddingBottom;
    groups.push({
      stepIndex: group.stepIndex,
      stepId: group.stepId,
      title: group.title,
      x: groupX,
      y: cursorY,
      width: groupWidth,
      height,
    });
    cursorY += height + metrics.groupGap;
  }

  const boxes = new Map<string, FlowRect>([
    ...nodes.map((node) => [node.id, node] as const),
    ...links.map((link) => [link.id, link] as const),
  ]);
  const edges: FlowEdgeLine[] = [];
  for (const edge of diagram.edges) {
    const from = boxes.get(edge.from);
    const to = boxes.get(edge.to);
    if (from && to) {
      edges.push({ from: edge.from, to: edge.to, kind: edge.kind, points: connect(from, to) });
    }
  }
  for (const group of diagram.groups) {
    const source = group.nodeIds[group.nodeIds.length - 1];
    const from = source ? boxes.get(source) : undefined;
    if (!source || !from) {
      continue;
    }
    for (const linkId of group.linkIds) {
      const to = boxes.get(linkId);
      if (to) {
        edges.push({ from: source, to: linkId, kind: "link", points: connect(from, to) });
      }
    }
  }

  const height = groups.length === 0
    ? metrics.canvasPadding * 2
    : cursorY - metrics.groupGap + metrics.canvasPadding;
  return {
    width: groupWidth + metrics.canvasPadding * 2,
    height,
    groups,
    nodes,
    links,
    edges,
  };
}

function rowCount(items: number, columns: number): number {
  return items === 0 ? 0 : Math.ceil(items / columns);
}

function connect(from: FlowRect, to: FlowRect): readonly FlowPoint[] {
  const sameRow = Math.abs(from.y - to.y) < 1;
  if (sameRow && to.x >= from.x + from.width) {
    return [
      { x: from.x + from.width, y: from.y + from.height / 2 },
      { x: to.x, y: to.y + to.height / 2 },
    ];
  }
  const middleY = (from.y + from.height + to.y) / 2;
  return [
    { x: from.x + from.width / 2, y: from.y + from.height },
    { x: from.x + from.width / 2, y: middleY },
    { x: to.x + to.width / 2, y: middleY },
    { x: to.x + to.width / 2, y: to.y },
  ];
}
