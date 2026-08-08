import { AnchorHealth } from "../../domain/tour/TourAnchor";
import type { FlowEdgeLine, FlowNodeBox, TourFlowLayout } from "./TourFlowLayout";

export interface TourFlowSvgOptions {
  /** Node id of the hop that playback is currently showing. */
  readonly currentNodeId?: string;
}

/** Half-width columns that fit inside a node at the sizes the stylesheet uses. */
const summaryLineWidth = 28;
const summaryLines = 2;
const anchorLineWidth = 34;

/** Theme-aware styles for the markup {@link renderTourFlowSvg} produces. */
export const tourFlowStyles = `
.flow-canvas { display: block; }
.flow-group { fill: var(--vscode-editorWidget-background); stroke: var(--vscode-editorWidget-border, var(--vscode-panel-border)); stroke-width: 1; }
.flow-group-title { fill: var(--vscode-descriptionForeground); font-size: 12px; font-weight: 600; }
.flow-group-empty { fill: var(--vscode-descriptionForeground); font-size: 11px; font-style: italic; }
.flow-edge { fill: none; stroke: var(--vscode-editorIndentGuide-activeBackground, var(--vscode-foreground)); stroke-width: 1.5; opacity: 0.8; }
.flow-edge.step { stroke-dasharray: 5 4; }
.flow-edge.link { stroke-dasharray: 2 4; opacity: 0.6; }
.flow-arrow-head { fill: var(--vscode-editorIndentGuide-activeBackground, var(--vscode-foreground)); opacity: 0.8; }
.flow-node-body { fill: var(--vscode-editor-background); stroke: var(--vscode-panel-border); stroke-width: 1; }
.flow-node-accent { fill: var(--vscode-charts-blue, var(--vscode-textLink-foreground)); }
.flow-node.drifted .flow-node-accent { fill: var(--vscode-editorWarning-foreground); }
.flow-node.broken .flow-node-accent { fill: var(--vscode-editorError-foreground); }
.flow-node-ordinal { fill: var(--vscode-descriptionForeground); font-size: 10px; font-weight: 600; }
.flow-node-summary { fill: var(--vscode-foreground); font-size: 12px; }
.flow-node-anchor { fill: var(--vscode-descriptionForeground); font-size: 10px; }
.flow-node { cursor: pointer; }
.flow-node:focus { outline: none; }
.flow-node:hover .flow-node-body, .flow-node:focus .flow-node-body { stroke: var(--vscode-focusBorder); stroke-width: 2; }
.flow-node.current .flow-node-body { fill: var(--vscode-editor-selectionBackground); stroke: var(--vscode-focusBorder); stroke-width: 2; }
.flow-link-body { fill: transparent; stroke: var(--vscode-panel-border); stroke-width: 1; stroke-dasharray: 3 3; }
.flow-link-label { fill: var(--vscode-textLink-foreground); font-size: 11px; }
`.trim();

/**
 * Renders a laid-out diagram as inline SVG. Nodes carry `data-node-id` so the hosting webview
 * can turn a click into a playback jump without knowing anything about the geometry.
 */
export function renderTourFlowSvg(
  layout: TourFlowLayout,
  options: TourFlowSvgOptions = {},
): string {
  const groups = layout.groups.map((group) => {
    const empty = layout.nodes.every((node) => node.node.stepIndex !== group.stepIndex);
    const placeholder = empty
      ? `<text class="flow-group-empty" x="${group.x + 16}" y="${group.y + 58}">ホップがありません</text>`
      : "";
    return [
      `<rect class="flow-group" x="${group.x}" y="${group.y}" width="${group.width}" height="${group.height}" rx="10" />`,
      `<text class="flow-group-title" x="${group.x + 16}" y="${group.y + 22}">${escapeXml(
        `${group.stepIndex + 1}. ${truncate(group.title, Math.floor(group.width / 6))}`,
      )}</text>`,
      placeholder,
    ].join("");
  });

  const edges = layout.edges.map((edge) => renderEdge(edge));
  const nodes = layout.nodes.map((box) => renderNode(box, options.currentNodeId === box.id));
  const links = layout.links.map((box) => [
    `<g class="flow-link" data-link-target="${escapeXml(box.link.target)}">`,
    `<title>${escapeXml(`${box.link.label}（リンク先: ${box.link.target}）`)}</title>`,
    `<rect class="flow-link-body" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="6" />`,
    `<text class="flow-link-label" x="${box.x + 10}" y="${box.y + 18}">${escapeXml(
      truncate(`↗ ${box.link.label}`, anchorLineWidth),
    )}</text>`,
    "</g>",
  ].join(""));

  return [
    `<svg class="flow-canvas" xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="ツアーのフロー図">`,
    '<defs><marker id="konstelia-flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="flow-arrow-head" d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>',
    `<g class="flow-groups">${groups.join("")}</g>`,
    `<g class="flow-edges">${edges.join("")}</g>`,
    `<g class="flow-links">${links.join("")}</g>`,
    `<g class="flow-nodes">${nodes.join("")}</g>`,
    "</svg>",
  ].join("");
}

function renderEdge(edge: FlowEdgeLine): string {
  const path = edge.points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${round(point.x)} ${round(point.y)}`)
    .join(" ");
  return `<path class="flow-edge ${edgeClass(edge.kind)}" d="${path}" marker-end="url(#konstelia-flow-arrow)" />`;
}

/** Class names are mapped from a closed set so no tour-supplied text can reach an attribute. */
function edgeClass(kind: FlowEdgeLine["kind"]): string {
  if (kind === "step") return "step";
  if (kind === "link") return "link";
  return "hop";
}

function healthClass(health: AnchorHealth): string {
  if (health === AnchorHealth.Broken) return "broken";
  if (health === AnchorHealth.Drifted) return "drifted";
  return "healthy";
}

function renderNode(box: FlowNodeBox, current: boolean): string {
  const { node } = box;
  const classes = ["flow-node", healthClass(node.health), ...(current ? ["current"] : [])].join(" ");
  const primary = node.anchors.find((anchor) => anchor.emphasis === "primary") ?? node.anchors[0];
  const secondaryCount = node.anchors.filter((anchor) => anchor.emphasis === "secondary").length;
  const anchorLabel = primary
    ? `${primary.ref}${secondaryCount > 0 ? ` +${secondaryCount}` : ""}`
    : "アンカー未設定";
  const lines = wrapText(node.summary, summaryLineWidth, summaryLines);
  const summary = lines
    .map((line, index) => `<text class="flow-node-summary" x="${box.x + 14}" y="${box.y + 38 + index * 16}">${escapeXml(line)}</text>`)
    .join("");
  const bodyMark = node.hasBody
    ? `<text class="flow-node-ordinal" x="${box.x + box.width - 22}" y="${box.y + 18}">本文</text>`
    : "";
  const label = `${node.ordinal + 1}. ${node.summary}${node.health === AnchorHealth.Healthy ? "" : ` (${node.health})`}`;
  return [
    `<g class="${classes}" data-node-id="${escapeXml(node.id)}" role="button" tabindex="0" aria-label="${escapeXml(label)}">`,
    `<rect class="flow-node-body" x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="8" />`,
    `<rect class="flow-node-accent" x="${box.x}" y="${box.y + 8}" width="4" height="${box.height - 16}" rx="2" />`,
    `<text class="flow-node-ordinal" x="${box.x + 14}" y="${box.y + 18}">#${node.ordinal + 1}</text>`,
    bodyMark,
    summary,
    `<text class="flow-node-anchor" x="${box.x + 14}" y="${box.y + box.height - 12}">${escapeXml(
      truncate(anchorLabel, anchorLineWidth),
    )}</text>`,
    "</g>",
  ].join("");
}

/** Widths are measured in half-width units so Japanese text wraps at a sensible point. */
function displayWidth(value: string): number {
  let width = 0;
  for (const character of value) {
    width += characterWidth(character);
  }
  return width;
}

function characterWidth(character: string): number {
  return (character.codePointAt(0) ?? 0) > 0x2000 ? 2 : 1;
}

export function truncate(value: string, maxWidth: number): string {
  if (displayWidth(value) <= maxWidth) {
    return value;
  }
  const budget = maxWidth - characterWidth("…");
  let result = "";
  let width = 0;
  for (const character of value) {
    const next = width + characterWidth(character);
    if (next > budget) {
      break;
    }
    result += character;
    width = next;
  }
  return `${result}…`;
}

export function wrapText(value: string, maxWidth: number, maxLines: number): string[] {
  const normalized = value.replace(/\s+/g, " ").trim();
  const lines: string[] = [];
  let line = "";
  for (const character of normalized) {
    if (displayWidth(line + character) > maxWidth) {
      if (lines.length + 1 === maxLines) {
        lines.push(truncate(`${line}${character}`, maxWidth));
        return lines;
      }
      lines.push(line);
      line = character === " " ? "" : character;
      continue;
    }
    line += character;
  }
  if (line || lines.length === 0) {
    lines.push(line);
  }
  return lines;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
