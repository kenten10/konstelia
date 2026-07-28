export interface AnchorOffsetRange {
  start: number;
  end: number;
}

export interface GeneratedSemanticAnchor {
  symbol: string;
  refinement?: string;
  range: AnchorOffsetRange;
  snapped: boolean;
  note?: string;
}

export interface SimilarSemanticAnchor {
  target: GeneratedSemanticAnchor;
  similarity: number;
}

export type GenerateSemanticAnchorResult =
  | { ok: true; target: GeneratedSemanticAnchor }
  | { ok: false; reason: string };

export type ResolveSemanticAnchorResult =
  | { ok: true; range: AnchorOffsetRange }
  | { ok: false; reason: string; fallbackRange?: AnchorOffsetRange };

export interface SemanticAnchorAdapter {
  generate(sourceText: string, fileName: string, start: number, end: number): GenerateSemanticAnchorResult;
  resolve(
    sourceText: string,
    fileName: string,
    symbolPath: string,
    refinement?: string | null,
  ): ResolveSemanticAnchorResult;
  findSnapshotCandidates(
    sourceText: string,
    fileName: string,
    snapshotText: string,
  ): AnchorOffsetRange[];
  findSimilarSnapshotCandidates(
    sourceText: string,
    fileName: string,
    snapshotText: string,
  ): SimilarSemanticAnchor[];
}
