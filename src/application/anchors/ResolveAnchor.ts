import { AnchorHealth, type TourAnchor } from "../../domain/tour/TourAnchor";
import type { AnchorOffsetRange, SemanticAnchorAdapter } from "./SemanticAnchorAdapter";
import { normalizeSnapshotText } from "./AnchorSnapshot";

export interface AnchorResolution {
  health: AnchorHealth;
  range?: AnchorOffsetRange;
  reason?: string;
}

export class ResolveAnchor {
  public constructor(private readonly adapter: SemanticAnchorAdapter) {}

  public execute(anchor: TourAnchor, sourceText: string): AnchorResolution {
    const result = this.adapter.resolve(
      sourceText,
      anchor.file,
      anchor.symbol,
      anchor.refinement,
    );
    if (result.ok) {
      if (anchor.snapshot) {
        const currentText = normalizeSnapshotText(sourceText.slice(result.range.start, result.range.end));
        if (currentText !== anchor.snapshot.text) {
          // The saved text may still exist somewhere else, which means the symbol path now
          // resolves to a different declaration than the one the author anchored.
          const candidates = this.adapter
            .findSnapshotCandidates(sourceText, anchor.file, anchor.snapshot.text)
            .filter((candidate) =>
              candidate.start !== result.range.start || candidate.end !== result.range.end);
          if (candidates.length === 1) {
            return {
              health: AnchorHealth.Drifted,
              range: candidates[0],
              reason: "symbol-path resolved to changed content; snapshot matched one candidate.",
            };
          }
          if (candidates.length > 1) {
            return {
              health: AnchorHealth.Drifted,
              range: result.range,
              reason: "symbol-path resolved but the saved snapshot matches several other places.",
            };
          }
          // The saved text exists nowhere else, so the anchored code was edited in place. The
          // anchor still points at what the author chose, which specification §7.1 calls healthy.
        }
      }
      return { health: AnchorHealth.Healthy, range: result.range };
    }
    if (result.fallbackRange) {
      return {
        health: AnchorHealth.Drifted,
        range: result.fallbackRange,
        reason: result.reason,
      };
    }
    if (anchor.snapshot) {
      const candidates = this.adapter.findSnapshotCandidates(
        sourceText,
        anchor.file,
        anchor.snapshot.text,
      );
      if (candidates.length === 1) {
        return {
          health: AnchorHealth.Drifted,
          range: candidates[0],
          reason: "symbol-path failed but snapshot matched one candidate.",
        };
      }
    }
    return { health: AnchorHealth.Broken, reason: result.reason };
  }
}
