import { normalizeSnapshotText } from "../../application/anchors/AnchorSnapshot";
import type {
  AnchorOffsetRange,
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

export interface StructuralRefinement {
  readonly key: string;
  readonly range: AnchorOffsetRange;
}

export interface StructuralSymbol {
  readonly name: string;
  readonly range: AnchorOffsetRange;
  parent?: StructuralSymbol;
  readonly refinements: StructuralRefinement[];
}

export interface StructuralDocument {
  readonly symbols: StructuralSymbol[];
}

export type StructuralDocumentParser = (sourceText: string) => StructuralDocument;

export class StructuralSemanticAnchorAdapter implements SemanticAnchorAdapter {
  public constructor(
    private readonly languageName: string,
    private readonly parseDocument: StructuralDocumentParser,
  ) {}

  public generate(
    sourceText: string,
    _fileName: string,
    rawStart: number,
    rawEnd: number,
  ): GenerateSemanticAnchorResult {
    return this.generateFrom(this.parseDocument(sourceText), sourceText, rawStart, rawEnd);
  }

  /** Generation over an already parsed document, so a scan can parse the file once. */
  private generateFrom(
    document: StructuralDocument,
    sourceText: string,
    rawStart: number,
    rawEnd: number,
  ): GenerateSemanticAnchorResult {
    const [start, end] = normalizeSelection(sourceText, rawStart, rawEnd);
    const symbol = document.symbols
      .filter((candidate) => contains(candidate.range, start, end))
      .sort((left, right) => rangeLength(left.range) - rangeLength(right.range))[0];
    if (!symbol) {
      return { ok: false, reason: `No stable named ${this.languageName} symbol contains the selection.` };
    }

    const chain = symbolChain(symbol);
    let path: string;
    try {
      path = formatTypeScriptSymbolPath({
        segments: chain.map((candidate) => segmentFor(document, candidate)),
      });
    } catch (error) {
      return { ok: false, reason: errorMessage(error, `Could not generate a ${this.languageName} symbol-path.`) };
    }

    const exactSymbol = symbol.range.start === start && symbol.range.end === end;
    const refinement = symbol.refinements
      .filter((candidate) => contains(candidate.range, start, end))
      .sort((left, right) => rangeLength(left.range) - rangeLength(right.range))[0];
    const target = exactSymbol || !refinement
      ? {
          symbol: path,
          range: symbol.range,
          snapped: !exactSymbol,
          note: exactSymbol ? undefined : `Selection snapped to the nearest stable ${this.languageName} symbol.`,
        }
      : {
          symbol: path,
          refinement: refinementWithOrdinal(symbol, refinement),
          range: refinement.range,
          snapped: refinement.range.start !== start || refinement.range.end !== end,
          note: `Selection resolved through a ${this.languageName} structural refinement.`,
        };
    const resolved = this.resolveIn(document, target.symbol, target.refinement);
    return resolved.ok && equalRange(resolved.range, target.range)
      ? { ok: true, target }
      : { ok: false, reason: `The generated ${this.languageName} symbol-path did not resolve to its source range.` };
  }

  public resolve(
    sourceText: string,
    _fileName: string,
    symbolPath: string,
    refinement?: string | null,
  ): ResolveSemanticAnchorResult {
    return this.resolveIn(this.parseDocument(sourceText), symbolPath, refinement);
  }

  private resolveIn(
    document: StructuralDocument,
    symbolPath: string,
    refinement?: string | null,
  ): ResolveSemanticAnchorResult {
    let parsedPath;
    try {
      parsedPath = parseTypeScriptSymbolPath(symbolPath);
    } catch (error) {
      return { ok: false, reason: errorMessage(error, `Invalid ${this.languageName} symbol-path.`) };
    }

    let parent: StructuralSymbol | undefined;
    for (const segment of parsedPath.segments) {
      const matches = document.symbols
        .filter((candidate) => candidate.parent === parent && candidate.name === segment.name)
        .sort((left, right) => left.range.start - right.range.start);
      const selected = segment.ordinal === undefined ? matches : matches[segment.ordinal] ? [matches[segment.ordinal]] : [];
      if (selected.length === 0) {
        return { ok: false, reason: `Symbol segment '${segment.name}' could not be resolved.` };
      }
      if (selected.length > 1) {
        return { ok: false, reason: `Symbol segment '${segment.name}' is ambiguous.` };
      }
      parent = selected[0];
    }
    if (!parent) return { ok: false, reason: `Symbol '${symbolPath}' could not be resolved.` };
    if (!refinement) return { ok: true, range: parent.range };

    let parsedRefinement;
    try {
      parsedRefinement = parseTypeScriptRefinement(refinement);
    } catch (error) {
      return { ok: false, reason: errorMessage(error, `Invalid ${this.languageName} refinement.`), fallbackRange: parent.range };
    }
    const key = refinementKey(parsedRefinement);
    const matches = parent.refinements
      .filter((candidate) => candidate.key === key)
      .sort((left, right) => left.range.start - right.range.start);
    if (parsedRefinement.kind === "return" && parsedRefinement.ordinal === undefined && matches.length > 1) {
      return { ok: false, reason: `Refinement '${refinement}' is ambiguous.`, fallbackRange: parent.range };
    }
    const selected = matches[parsedRefinement.ordinal ?? 0];
    return selected
      ? { ok: true, range: selected.range }
      : { ok: false, reason: `Refinement '${refinement}' could not be resolved.`, fallbackRange: parent.range };
  }

  public findSnapshotCandidates(
    sourceText: string,
    _fileName: string,
    snapshotText: string,
  ): AnchorOffsetRange[] {
    const expected = normalizeSnapshotText(snapshotText);
    return uniqueRanges(candidateRanges(this.parseDocument(sourceText)))
      .filter((range) => normalizeSnapshotText(sourceText.slice(range.start, range.end)) === expected);
  }

  public findSimilarSnapshotCandidates(
    sourceText: string,
    _fileName: string,
    snapshotText: string,
  ): SimilarSemanticAnchor[] {
    // One parse for the whole scan: generating each candidate used to reparse the file twice,
    // which made a repair search quadratic in the size of the file.
    const document = this.parseDocument(sourceText);
    return uniqueRanges(candidateRanges(document))
      .map((range): SimilarSemanticAnchor | undefined => {
        const generated = this.generateFrom(document, sourceText, range.start, range.end);
        if (!generated.ok) return undefined;
        return {
          target: generated.target,
          similarity: snapshotSimilarity(snapshotText, sourceText.slice(range.start, range.end)),
        };
      })
      .filter((candidate): candidate is SimilarSemanticAnchor => candidate !== undefined)
      .sort((left, right) => right.similarity - left.similarity);
  }
}

function symbolChain(symbol: StructuralSymbol): StructuralSymbol[] {
  const chain: StructuralSymbol[] = [];
  for (let current: StructuralSymbol | undefined = symbol; current; current = current.parent) chain.unshift(current);
  return chain;
}

function segmentFor(document: StructuralDocument, symbol: StructuralSymbol): { name: string; ordinal?: number } {
  const peers = document.symbols
    .filter((candidate) => candidate.parent === symbol.parent && candidate.name === symbol.name)
    .sort((left, right) => left.range.start - right.range.start);
  return peers.length > 1 ? { name: symbol.name, ordinal: peers.indexOf(symbol) } : { name: symbol.name };
}

function refinementWithOrdinal(symbol: StructuralSymbol, refinement: StructuralRefinement): string {
  const peers = symbol.refinements
    .filter((candidate) => candidate.key === refinement.key)
    .sort((left, right) => left.range.start - right.range.start);
  return `${refinement.key}[${peers.indexOf(refinement)}]`;
}

function candidateRanges(document: StructuralDocument): AnchorOffsetRange[] {
  return document.symbols.flatMap((symbol) => [symbol.range, ...symbol.refinements.map((item) => item.range)]);
}

function uniqueRanges(ranges: readonly AnchorOffsetRange[]): AnchorOffsetRange[] {
  return ranges.filter((range, index) =>
    ranges.findIndex((candidate) => equalRange(candidate, range)) === index,
  );
}

function normalizeSelection(sourceText: string, rawStart: number, rawEnd: number): [number, number] {
  let start = Math.max(0, rawStart);
  let end = Math.min(sourceText.length, rawEnd);
  while (start < end && /\s/.test(sourceText[start] ?? "")) start += 1;
  while (end > start && /\s/.test(sourceText[end - 1] ?? "")) end -= 1;
  return [start, end];
}

function contains(range: AnchorOffsetRange, start: number, end: number): boolean {
  return range.start <= start && end <= range.end;
}

function rangeLength(range: AnchorOffsetRange): number {
  return range.end - range.start;
}

function equalRange(left: AnchorOffsetRange, right: AnchorOffsetRange): boolean {
  return left.start === right.start && left.end === right.end;
}

function snapshotSimilarity(leftText: string, rightText: string): number {
  const left = tokens(leftText);
  const right = tokens(rightText);
  if (left.length === 0 || right.length === 0) return 0;
  if (normalizeSnapshotText(leftText) === normalizeSnapshotText(rightText)) return 1;
  return multisetDice(left, right) * 0.65 + multisetDice(tokenPairs(left), tokenPairs(right)) * 0.35;
}

function tokens(text: string): string[] {
  return normalizeSnapshotText(text).match(/[\p{L}_$][\p{L}\p{N}_$]*|\d+(?:\.\d+)?|[^\s\p{L}\p{N}_]/gu) ?? [];
}

function tokenPairs(values: readonly string[]): string[] {
  return values.slice(1).map((value, index) => `${values[index]}\u0000${value}`);
}

function multisetDice(left: readonly string[], right: readonly string[]): number {
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
  return left.length + right.length === 0 ? 1 : (2 * overlap) / (left.length + right.length);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
