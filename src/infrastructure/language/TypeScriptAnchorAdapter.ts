import ts from "typescript";
import { normalizeSnapshotText } from "../../application/anchors/AnchorSnapshot";
import type {
  AnchorOffsetRange,
  SemanticAnchorAdapter,
  SimilarSemanticAnchor,
} from "../../application/anchors/SemanticAnchorAdapter";
import {
  formatTypeScriptSymbolPath,
  parseTypeScriptRefinement,
  parseTypeScriptSymbolPath,
  refinementKey as typeScriptRefinementKey,
  TypeScriptSymbolPathSyntaxError,
  type TypeScriptSymbolPathSegment,
} from "./TypeScriptSymbolPath";

export interface GeneratedAnchorTarget {
  symbol: string;
  refinement?: string;
  range: AnchorOffsetRange;
  snapped: boolean;
  note?: string;
}

export type GenerateAnchorResult =
  | { ok: true; target: GeneratedAnchorTarget }
  | { ok: false; reason: string };

export type ResolveAnchorResult =
  | { ok: true; range: AnchorOffsetRange }
  | { ok: false; reason: string; fallbackRange?: AnchorOffsetRange };

interface RefinementNode {
  node: ts.Node;
  key: string;
}

export class TypeScriptAnchorAdapter implements SemanticAnchorAdapter {
  public generate(
    sourceText: string,
    fileName: string,
    rawStart: number,
    rawEnd: number,
  ): GenerateAnchorResult {
    const sourceFile = createSourceFile(sourceText, fileName);
    return generateTarget(sourceFile, sourceText, fileName, rawStart, rawEnd, true);
  }

  public resolve(
    sourceText: string,
    fileName: string,
    symbolPath: string,
    refinement?: string | null,
  ): ResolveAnchorResult {
    const sourceFile = createSourceFile(sourceText, fileName);
    let parsedPath;
    try {
      parsedPath = parseTypeScriptSymbolPath(symbolPath);
    } catch (error) {
      return { ok: false, reason: syntaxErrorMessage(error) };
    }
    let scopes: ts.Node[] = [sourceFile];
    for (const segment of parsedPath.segments) {
      const matches = scopes.flatMap((scope) => collectNamedChildren(scope))
        .filter((node) => symbolName(node) === segment.name)
        .sort((left, right) => left.getStart(sourceFile) - right.getStart(sourceFile));
      let selected: ts.Node[];
      if (segment.ordinal === undefined) {
        selected = matches;
      } else {
        const ordinalMatch = matches[segment.ordinal];
        selected = ordinalMatch ? [ordinalMatch] : [];
      }
      if (selected.length === 0) {
        return { ok: false, reason: `Symbol segment '${formatSegment(segment)}' could not be resolved.` };
      }
      if (selected.length > 1) {
        return { ok: false, reason: `Symbol segment '${formatSegment(segment)}' is ambiguous.` };
      }
      scopes = selected;
    }
    const symbolNode = scopes[0];
    if (!symbolNode) {
      return { ok: false, reason: `Symbol '${symbolPath}' could not be resolved.` };
    }
    const symbolRange = nodeRange(sourceFile, symbolNode);
    if (!refinement) {
      return { ok: true, range: symbolRange };
    }
    let parsedRefinement;
    try {
      parsedRefinement = parseTypeScriptRefinement(refinement);
    } catch (error) {
      return { ok: false, reason: syntaxErrorMessage(error), fallbackRange: symbolRange };
    }
    const nodes = collectRefinements(symbolNode)
      .filter((candidate) => candidate.key === typeScriptRefinementKey(parsedRefinement))
      .sort((left, right) => left.node.getStart(sourceFile) - right.node.getStart(sourceFile));
    if (parsedRefinement.kind === "return" && parsedRefinement.ordinal === undefined && nodes.length > 1) {
      return {
        ok: false,
        reason: `Refinement '${refinement}' is ambiguous (${nodes.length} return statements).`,
        fallbackRange: symbolRange,
      };
    }
    const selected = nodes[parsedRefinement.ordinal ?? 0];
    if (!selected) {
      return {
        ok: false,
        reason: `Refinement '${refinement}' could not be resolved.`,
        fallbackRange: symbolRange,
      };
    }
    return { ok: true, range: nodeRange(sourceFile, selected.node) };
  }

  public findSnapshotCandidates(
    sourceText: string,
    fileName: string,
    snapshotText: string,
  ): AnchorOffsetRange[] {
    const sourceFile = createSourceFile(sourceText, fileName);
    const expected = normalizeSnapshotText(snapshotText);
    const matches: AnchorOffsetRange[] = [];
    const visit = (node: ts.Node): void => {
      if (
        node !== sourceFile &&
        normalizeSnapshotText(sourceText.slice(node.getStart(sourceFile), node.getEnd())) === expected
      ) {
        matches.push(nodeRange(sourceFile, node));
      }
      node.forEachChild(visit);
    };
    visit(sourceFile);
    return matches.filter((match, index) =>
      matches.findIndex((candidate) => candidate.start === match.start && candidate.end === match.end) === index,
    );
  }

  public findSimilarSnapshotCandidates(
    sourceText: string,
    fileName: string,
    snapshotText: string,
  ): SimilarSemanticAnchor[] {
    const sourceFile = createSourceFile(sourceText, fileName);
    return collectRepairCandidateRanges(sourceFile)
      .map((range): SimilarSemanticAnchor | undefined => {
        const result = generateTarget(
          sourceFile,
          sourceText,
          fileName,
          range.start,
          range.end,
          false,
        );
        if (!result.ok) return undefined;
        return {
          target: result.target,
          similarity: snapshotSimilarity(
            snapshotText,
            sourceText.slice(result.target.range.start, result.target.range.end),
          ),
        };
      })
      .filter((candidate): candidate is SimilarSemanticAnchor => candidate !== undefined)
      .sort((left, right) => right.similarity - left.similarity);
  }
}

function generateTarget(
  sourceFile: ts.SourceFile,
  sourceText: string,
  fileName: string,
  rawStart: number,
  rawEnd: number,
  verify: boolean,
): GenerateAnchorResult {
  const [start, end] = normalizeSelection(sourceText, rawStart, rawEnd);
  const chain = namedChainFor(sourceFile, start, end);
  if (chain.length === 0) {
    return { ok: false, reason: "No stable named symbol contains the selection." };
  }
  const inner = chain.at(-1);
  if (!inner) {
    return { ok: false, reason: "No stable named symbol contains the selection." };
  }
  let symbol: string;
  try {
    symbol = formatTypeScriptSymbolPath({
      segments: chain.map((node) => segmentFor(sourceFile, node)),
    });
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Could not generate a stable symbol-path.",
    };
  }
  const innerRange = nodeRange(sourceFile, inner);
  const innerExact = innerRange.start === start && innerRange.end === end;
  if (innerExact) {
    return finishGeneratedTarget(
      sourceText,
      fileName,
      { symbol, range: innerRange, snapped: false },
      verify,
    );
  }

  const refinement = refinementFor(sourceFile, inner, start, end);
  if (!refinement) {
    return finishGeneratedTarget(sourceText, fileName, {
      symbol,
      range: innerRange,
      snapped: true,
      note: "Selection snapped to the nearest stable named symbol.",
    }, verify);
  }
  return finishGeneratedTarget(sourceText, fileName, {
    symbol,
    refinement: refinement.key,
    range: nodeRange(sourceFile, refinement.node),
    snapped:
      refinement.node.getStart(sourceFile) !== start || refinement.node.getEnd() !== end,
    note: "Selection resolved through a structural refinement.",
  }, verify);
}

function finishGeneratedTarget(
  sourceText: string,
  fileName: string,
  target: GeneratedAnchorTarget,
  verify: boolean,
): GenerateAnchorResult {
  return verify ? verifyGeneratedTarget(sourceText, fileName, target) : { ok: true, target };
}

function collectRepairCandidateRanges(sourceFile: ts.SourceFile): AnchorOffsetRange[] {
  const ranges: AnchorOffsetRange[] = [];
  const visit = (node: ts.Node): void => {
    if (node !== sourceFile && (symbolName(node) || refinementKey(node))) {
      ranges.push(nodeRange(sourceFile, node));
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return ranges;
}

function snapshotSimilarity(leftText: string, rightText: string): number {
  const left = tokens(leftText);
  const right = tokens(rightText);
  if (left.length === 0 || right.length === 0) return 0;
  if (normalizeSnapshotText(leftText) === normalizeSnapshotText(rightText)) return 1;
  const tokenScore = multisetDice(left, right);
  const sequenceScore = multisetDice(tokenPairs(left), tokenPairs(right));
  return tokenScore * 0.65 + sequenceScore * 0.35;
}

function tokens(text: string): string[] {
  return normalizeSnapshotText(text).match(/[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|[^\s\w]/g) ?? [];
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

function createSourceFile(sourceText: string, fileName: string): ts.SourceFile {
  const normalized = fileName.toLowerCase();
  const scriptKind = normalized.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : normalized.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : normalized.endsWith(".js") || normalized.endsWith(".mjs") || normalized.endsWith(".cjs")
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;
  return ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
}

function symbolName(node: ts.Node): string | undefined {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isEnumDeclaration(node)
  ) {
    return node.name?.text;
  }
  if (ts.isModuleDeclaration(node)) {
    return node.name.text;
  }
  if (ts.isConstructorDeclaration(node)) {
    return "constructor";
  }
  if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    const name = propertyName(node.name);
    if (!name) {
      return undefined;
    }
    return `${name}[${ts.isGetAccessorDeclaration(node) ? "get" : "set"}]`;
  }
  if (
    ts.isMethodDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isPropertySignature(node) ||
    ts.isPropertyAssignment(node)
  ) {
    return propertyName(node.name);
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isModuleScopedVariable(node)) {
    return node.name.text;
  }
  return undefined;
}

function propertyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
    ? name.text
    : undefined;
}

function isModuleScopedVariable(node: ts.VariableDeclaration): boolean {
  const statement = node.parent.parent;
  const scope = statement.parent;
  return ts.isSourceFile(scope) || ts.isModuleBlock(scope);
}

function namedChainFor(sourceFile: ts.SourceFile, start: number, end: number): ts.Node[] {
  const chain: ts.Node[] = [];
  const descend = (node: ts.Node): void => {
    node.forEachChild((child) => {
      if (contains(sourceFile, child, start, end)) {
        if (symbolName(child)) {
          chain.push(child);
        }
        descend(child);
      }
    });
  };
  descend(sourceFile);
  return chain;
}

function contains(sourceFile: ts.SourceFile, node: ts.Node, start: number, end: number): boolean {
  return node.getStart(sourceFile) <= start && end <= node.getEnd();
}

function segmentFor(sourceFile: ts.SourceFile, node: ts.Node): TypeScriptSymbolPathSegment {
  const name = symbolName(node);
  if (!name) {
    throw new Error("Cannot create a segment for an unnamed node.");
  }
  const logicalScope = findLogicalScope(node);
  const peers = collectNamedChildren(logicalScope)
    .filter((candidate) => symbolName(candidate) === name)
    .sort((left, right) => left.getStart(sourceFile) - right.getStart(sourceFile));
  return peers.length > 1 ? { name, ordinal: peers.indexOf(node) } : { name };
}

function findLogicalScope(node: ts.Node): ts.Node {
  let scope = node.parent;
  while (scope.parent && !ts.isSourceFile(scope) && !symbolName(scope)) {
    scope = scope.parent;
  }
  return scope;
}

function collectNamedChildren(scope: ts.Node): ts.Node[] {
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    node.forEachChild((child) => {
      if (symbolName(child)) {
        nodes.push(child);
      } else {
        visit(child);
      }
    });
  };
  visit(scope);
  return nodes;
}

function refinementFor(
  sourceFile: ts.SourceFile,
  symbolNode: ts.Node,
  start: number,
  end: number,
): RefinementNode | undefined {
  const refinements = collectRefinements(symbolNode);
  const containing = refinements
    .filter((candidate) => contains(sourceFile, candidate.node, start, end))
    .sort((left, right) =>
      (left.node.getEnd() - left.node.getStart(sourceFile)) -
      (right.node.getEnd() - right.node.getStart(sourceFile)),
    );
  const selected = containing[0];
  if (!selected) {
    return undefined;
  }
  const peers = refinements
    .filter((candidate) => candidate.key === selected.key)
    .sort((left, right) => left.node.getStart(sourceFile) - right.node.getStart(sourceFile));
  return { node: selected.node, key: `${selected.key}[${peers.indexOf(selected)}]` };
}

function collectRefinements(symbolNode: ts.Node): RefinementNode[] {
  const refinements: RefinementNode[] = [];
  const visit = (node: ts.Node): void => {
    node.forEachChild((child) => {
      if (child !== symbolNode && symbolName(child)) {
        return;
      }
      const key = refinementKey(child);
      if (key) {
        refinements.push({ node: child, key });
      }
      visit(child);
    });
  };
  visit(symbolNode);
  return refinements;
}

function refinementKey(node: ts.Node): string | undefined {
  if (ts.isIfStatement(node)) return "if";
  if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) return "for";
  if (ts.isSwitchStatement(node)) return "switch";
  if (ts.isReturnStatement(node)) return "return";
  if (ts.isCallExpression(node)) return `call(${calleeName(node) ?? "?"})`;
  return undefined;
}

function calleeName(node: ts.CallExpression): string | undefined {
  if (ts.isIdentifier(node.expression)) {
    return node.expression.text;
  }
  if (ts.isPropertyAccessExpression(node.expression)) {
    return node.expression.name.text;
  }
  return undefined;
}

function normalizeSelection(sourceText: string, rawStart: number, rawEnd: number): [number, number] {
  let start = Math.max(0, rawStart);
  let end = Math.min(sourceText.length, rawEnd);
  while (start < end && /\s/.test(sourceText[start] ?? "")) start += 1;
  while (end > start && /[\s;]/.test(sourceText[end - 1] ?? "")) end -= 1;
  return [start, end];
}

function nodeRange(sourceFile: ts.SourceFile, node: ts.Node): AnchorOffsetRange {
  return { start: node.getStart(sourceFile), end: node.getEnd() };
}

function verifyGeneratedTarget(
  sourceText: string,
  fileName: string,
  target: GeneratedAnchorTarget,
): GenerateAnchorResult {
  const resolved = new TypeScriptAnchorAdapter().resolve(
    sourceText,
    fileName,
    target.symbol,
    target.refinement,
  );
  if (!resolved.ok || resolved.range.start !== target.range.start || resolved.range.end !== target.range.end) {
    return {
      ok: false,
      reason: "The generated symbol-path did not resolve back to the selected semantic target.",
    };
  }
  return { ok: true, target };
}

function formatSegment(segment: TypeScriptSymbolPathSegment): string {
  return segment.ordinal === undefined ? segment.name : `${segment.name}#${segment.ordinal}`;
}

function syntaxErrorMessage(error: unknown): string {
  return error instanceof TypeScriptSymbolPathSyntaxError
    ? error.message
    : "Invalid TypeScript symbol-path syntax.";
}
