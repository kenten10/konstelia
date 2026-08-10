import type { SyntaxNode } from "@lezer/common";
import { parser } from "@lezer/python";
import { normalizeSnapshotText } from "../../application/anchors/AnchorSnapshot";
import type {
  AnchorOffsetRange,
  GeneratedSemanticAnchor,
  GenerateSemanticAnchorResult,
  ResolveSemanticAnchorResult,
  SemanticAnchorAdapter,
  SimilarSemanticAnchor,
} from "../../application/anchors/SemanticAnchorAdapter";
import {
  formatTypeScriptSymbolPath,
  parseTypeScriptRefinement,
  parseTypeScriptSymbolPath,
  refinementKey,
} from "./TypeScriptSymbolPath";

interface RefinementNode {
  readonly node: SyntaxNode;
  readonly key: string;
}

export class PythonAnchorAdapter implements SemanticAnchorAdapter {
  public generate(
    sourceText: string,
    fileName: string,
    rawStart: number,
    rawEnd: number,
  ): GenerateSemanticAnchorResult {
    const root = parser.parse(sourceText).topNode;
    return generateTarget(root, sourceText, fileName, rawStart, rawEnd, true, this);
  }

  public resolve(
    sourceText: string,
    _fileName: string,
    symbolPath: string,
    refinement?: string | null,
  ): ResolveSemanticAnchorResult {
    const root = parser.parse(sourceText).topNode;
    let parsedPath;
    try {
      parsedPath = parseTypeScriptSymbolPath(symbolPath);
    } catch (error) {
      return { ok: false, reason: errorMessage(error, "Invalid Python symbol-path.") };
    }
    let scopes: SyntaxNode[] = [root];
    for (const segment of parsedPath.segments) {
      const matches = scopes
        .flatMap((scope) => collectNamedChildren(scope, sourceText))
        .filter((node) => symbolName(node, sourceText) === segment.name)
        .sort((left, right) => left.from - right.from);
      const ordinalMatch = segment.ordinal === undefined ? undefined : matches[segment.ordinal];
      const selected = segment.ordinal === undefined ? matches : ordinalMatch ? [ordinalMatch] : [];
      if (selected.length === 0) {
        return { ok: false, reason: `Symbol segment '${segment.name}' could not be resolved.` };
      }
      if (selected.length > 1) {
        return { ok: false, reason: `Symbol segment '${segment.name}' is ambiguous.` };
      }
      scopes = selected;
    }
    const symbolNode = scopes[0];
    if (!symbolNode) {
      return { ok: false, reason: `Symbol '${symbolPath}' could not be resolved.` };
    }
    const symbolRange = nodeRange(symbolNode);
    if (!refinement) return { ok: true, range: symbolRange };

    let parsedRefinement;
    try {
      parsedRefinement = parseTypeScriptRefinement(refinement);
    } catch (error) {
      return {
        ok: false,
        reason: errorMessage(error, "Invalid Python refinement."),
        fallbackRange: symbolRange,
      };
    }
    const key = refinementKey(parsedRefinement);
    const matches = collectRefinements(symbolNode, sourceText)
      .filter((candidate) => candidate.key === key)
      .sort((left, right) => left.node.from - right.node.from);
    if (parsedRefinement.kind === "return" && parsedRefinement.ordinal === undefined && matches.length > 1) {
      return {
        ok: false,
        reason: `Refinement '${refinement}' is ambiguous (${matches.length} return statements).`,
        fallbackRange: symbolRange,
      };
    }
    const selected = matches[parsedRefinement.ordinal ?? 0];
    if (!selected) {
      return {
        ok: false,
        reason: `Refinement '${refinement}' could not be resolved.`,
        fallbackRange: symbolRange,
      };
    }
    return { ok: true, range: nodeRange(selected.node) };
  }

  public findSnapshotCandidates(
    sourceText: string,
    _fileName: string,
    snapshotText: string,
  ): AnchorOffsetRange[] {
    const root = parser.parse(sourceText).topNode;
    const expected = normalizeSnapshotText(snapshotText);
    return descendants(root)
      .filter((node) =>
        node !== root && normalizeSnapshotText(sourceText.slice(node.from, node.to)) === expected,
      )
      .map(nodeRange)
      .filter((range, index, ranges) =>
        ranges.findIndex((candidate) => candidate.start === range.start && candidate.end === range.end) === index,
      );
  }

  public findSimilarSnapshotCandidates(
    sourceText: string,
    fileName: string,
    snapshotText: string,
  ): SimilarSemanticAnchor[] {
    const root = parser.parse(sourceText).topNode;
    return collectRepairCandidateNodes(root)
      .map((node): SimilarSemanticAnchor | undefined => {
        const generated = generateTarget(
          root,
          sourceText,
          fileName,
          node.from,
          node.to,
          false,
          this,
        );
        if (!generated.ok) return undefined;
        return {
          target: generated.target,
          similarity: snapshotSimilarity(
            snapshotText,
            sourceText.slice(generated.target.range.start, generated.target.range.end),
          ),
        };
      })
      .filter((candidate): candidate is SimilarSemanticAnchor => candidate !== undefined)
      .sort((left, right) => right.similarity - left.similarity);
  }
}

function generateTarget(
  root: SyntaxNode,
  sourceText: string,
  fileName: string,
  rawStart: number,
  rawEnd: number,
  verify: boolean,
  adapter: PythonAnchorAdapter,
): GenerateSemanticAnchorResult {
  const [start, end] = normalizeSelection(sourceText, rawStart, rawEnd);
  const chain = namedChainFor(root, sourceText, start, end);
  const inner = chain.at(-1);
  if (!inner) return { ok: false, reason: "No stable named Python symbol contains the selection." };

  let symbol: string;
  try {
    symbol = formatTypeScriptSymbolPath({
      segments: chain.map((node) => segmentFor(node, sourceText)),
    });
  } catch (error) {
    return { ok: false, reason: errorMessage(error, "Could not generate a Python symbol-path.") };
  }
  const innerRange = nodeRange(inner);
  let target: GeneratedSemanticAnchor;
  if (innerRange.start === start && innerRange.end === end) {
    target = { symbol, range: innerRange, snapped: false };
  } else {
    const refinement = refinementFor(inner, sourceText, start, end);
    target = refinement
      ? {
          symbol,
          refinement: refinement.key,
          range: nodeRange(refinement.node),
          snapped: refinement.node.from !== start || refinement.node.to !== end,
          note: "Selection resolved through a Python structural refinement.",
        }
      : {
          symbol,
          range: innerRange,
          snapped: true,
          note: "Selection snapped to the nearest stable Python symbol.",
        };
  }
  if (!verify) return { ok: true, target };
  const resolved = adapter.resolve(sourceText, fileName, target.symbol, target.refinement);
  return resolved.ok && resolved.range.start === target.range.start && resolved.range.end === target.range.end
    ? { ok: true, target }
    : { ok: false, reason: "The generated Python symbol-path did not resolve to its source node." };
}

function namedChainFor(
  root: SyntaxNode,
  sourceText: string,
  start: number,
  end: number,
): SyntaxNode[] {
  const chain: SyntaxNode[] = [];
  const visit = (node: SyntaxNode): void => {
    for (const child of children(node)) {
      if (child.from <= start && end <= child.to) {
        if (symbolName(child, sourceText)) chain.push(child);
        visit(child);
      }
    }
  };
  visit(root);
  return chain;
}

function segmentFor(node: SyntaxNode, sourceText: string): { name: string; ordinal?: number } {
  const name = symbolName(node, sourceText);
  if (!name) throw new Error("Cannot create a symbol segment for an unnamed Python node.");
  const scope = nearestNamedParent(node, sourceText) ?? rootOf(node);
  const peers = collectNamedChildren(scope, sourceText)
    .filter((candidate) => symbolName(candidate, sourceText) === name)
    .sort((left, right) => left.from - right.from);
  return peers.length > 1 ? { name, ordinal: peers.indexOf(node) } : { name };
}

function symbolName(node: SyntaxNode, sourceText: string): string | undefined {
  if (node.name !== "ClassDefinition" && node.name !== "FunctionDefinition") return undefined;
  const name = node.getChild("VariableName");
  return name ? sourceText.slice(name.from, name.to) : undefined;
}

function nearestNamedParent(node: SyntaxNode, sourceText: string): SyntaxNode | undefined {
  let parent = node.parent;
  while (parent) {
    if (symbolName(parent, sourceText)) return parent;
    parent = parent.parent;
  }
  return undefined;
}

function rootOf(node: SyntaxNode): SyntaxNode {
  let root = node;
  while (root.parent) root = root.parent;
  return root;
}

function collectNamedChildren(scope: SyntaxNode, sourceText: string): SyntaxNode[] {
  const matches: SyntaxNode[] = [];
  const visit = (node: SyntaxNode): void => {
    for (const child of children(node)) {
      if (symbolName(child, sourceText)) matches.push(child);
      else visit(child);
    }
  };
  visit(scope);
  return matches;
}

function refinementFor(
  symbolNode: SyntaxNode,
  sourceText: string,
  start: number,
  end: number,
): RefinementNode | undefined {
  const refinements = collectRefinements(symbolNode, sourceText);
  const selected = refinements
    .filter((candidate) => candidate.node.from <= start && end <= candidate.node.to)
    .sort((left, right) =>
      (left.node.to - left.node.from) - (right.node.to - right.node.from),
    )[0];
  if (!selected) return undefined;
  const peers = refinements
    .filter((candidate) => candidate.key === selected.key)
    .sort((left, right) => left.node.from - right.node.from);
  return { node: selected.node, key: `${selected.key}[${peers.indexOf(selected)}]` };
}

function collectRefinements(symbolNode: SyntaxNode, sourceText: string): RefinementNode[] {
  const refinements: RefinementNode[] = [];
  const visit = (node: SyntaxNode): void => {
    for (const child of children(node)) {
      if (child !== symbolNode && symbolName(child, sourceText)) continue;
      const key = pythonRefinementKey(child, sourceText);
      if (key) refinements.push({ node: child, key });
      visit(child);
    }
  };
  visit(symbolNode);
  return refinements;
}

function pythonRefinementKey(node: SyntaxNode, sourceText: string): string | undefined {
  if (node.name === "IfStatement") return "if";
  if (node.name === "ForStatement" || node.name === "WhileStatement") return "for";
  if (node.name === "MatchStatement") return "switch";
  if (node.name === "ReturnStatement") return "return";
  if (node.name === "CallExpression") {
    const name = calleeName(node, sourceText);
    return name ? `call(${name})` : undefined;
  }
  return undefined;
}

function calleeName(node: SyntaxNode, sourceText: string): string | undefined {
  const expression = children(node).find((child) => child.name !== "ArgList");
  if (!expression) return undefined;
  if (expression.name === "VariableName") return sourceText.slice(expression.from, expression.to);
  const property = expression.getChild("PropertyName");
  return property ? sourceText.slice(property.from, property.to) : undefined;
}

function collectRepairCandidateNodes(root: SyntaxNode): SyntaxNode[] {
  return descendants(root).filter((node) =>
    node !== root && (
      node.name === "ClassDefinition" ||
      node.name === "FunctionDefinition" ||
      node.name === "IfStatement" ||
      node.name === "ForStatement" ||
      node.name === "ReturnStatement" ||
      node.name === "CallExpression"
    ),
  );
}

function descendants(root: SyntaxNode): SyntaxNode[] {
  const nodes: SyntaxNode[] = [root];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node) nodes.push(...children(node));
  }
  return nodes;
}

function children(node: SyntaxNode): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) result.push(child);
  return result;
}

function nodeRange(node: SyntaxNode): AnchorOffsetRange {
  return { start: node.from, end: node.to };
}

function normalizeSelection(sourceText: string, rawStart: number, rawEnd: number): [number, number] {
  let start = Math.max(0, rawStart);
  let end = Math.min(sourceText.length, rawEnd);
  while (start < end && /\s/.test(sourceText[start] ?? "")) start += 1;
  while (end > start && /\s/.test(sourceText[end - 1] ?? "")) end -= 1;
  return [start, end];
}

function snapshotSimilarity(leftText: string, rightText: string): number {
  const left = tokens(leftText);
  const right = tokens(rightText);
  if (left.length === 0 || right.length === 0) return 0;
  if (normalizeSnapshotText(leftText) === normalizeSnapshotText(rightText)) return 1;
  return multisetDice(left, right) * 0.65 + multisetDice(tokenPairs(left), tokenPairs(right)) * 0.35;
}

function tokens(text: string): string[] {
  return normalizeSnapshotText(text).match(/[A-Za-z_]\w*|\d+(?:\.\d+)?|[^\s\w]/g) ?? [];
}

function tokenPairs(values: readonly string[]): string[] {
  return values.slice(1).map((value, index) => `${values[index]}\u0000${value}`);
}

function multisetDice(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 && right.length === 0) return 1;
  const remaining = new Map<string, number>();
  for (const value of left) remaining.set(value, (remaining.get(value) ?? 0) + 1);
  let overlap = 0;
  for (const value of right) {
    const count = remaining.get(value) ?? 0;
    if (count > 0) {
      overlap += 1;
      remaining.set(value, count - 1);
    }
  }
  return (2 * overlap) / (left.length + right.length);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
