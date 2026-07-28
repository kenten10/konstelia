import type { TourAnchor } from "../../domain/tour/TourAnchor";
import type { TourScope } from "../../domain/tour/TourScope";
import type { TourAnchorRegistryResolver } from "../tours/TourAnchorRegistry";
import type { AnchorProposal } from "./CreateAnchor";
import { createAnchorProposal } from "./CreateAnchor";
import type { AnchorSourceCatalog } from "./AnchorSourceCatalog";
import type { SemanticAnchorAdapter } from "./SemanticAnchorAdapter";

export interface AnchorRepairTarget {
  readonly proposal: AnchorProposal;
  readonly similarity: number;
}

export interface AnchorRepairDiscovery {
  readonly targets: readonly AnchorRepairTarget[];
  readonly skippedFiles: number;
  readonly cancelled: boolean;
}

interface RankedAnchorRepairTarget extends AnchorRepairTarget {
  readonly rank: number;
}

export class DiscoverAnchorRepairs {
  public constructor(
    private readonly adapter: SemanticAnchorAdapter,
    private readonly registryResolver: TourAnchorRegistryResolver,
    private readonly sourceCatalog: AnchorSourceCatalog,
  ) {}

  public listAnchors(scope: TourScope): Promise<TourAnchor[]> {
    return this.registryResolver.resolve(scope).loadAnchors();
  }

  public async execute(scope: TourScope, anchorId: string): Promise<AnchorRepairDiscovery> {
    const anchor = (await this.listAnchors(scope)).find((candidate) => candidate.id === anchorId);
    if (!anchor) {
      throw new Error(`Anchor id '${anchorId}' does not exist in ${scope} storage.`);
    }
    if (!anchor.snapshot?.text) {
      return { targets: [], skippedFiles: 0, cancelled: false };
    }

    const scan = await this.sourceCatalog.scanSources();
    const targets = scan.sources.flatMap((source) =>
      this.adapter
        .findSimilarSnapshotCandidates(source.sourceText, source.file, anchor.snapshot?.text ?? "")
        .map((candidate): RankedAnchorRepairTarget => {
          const proposal = createAnchorProposal({
            file: source.file,
            sourceText: source.sourceText,
            selectionStart: candidate.target.range.start,
            selectionEnd: candidate.target.range.end,
          }, candidate.target);
          return {
            proposal,
            similarity: candidate.similarity,
            rank: rankCandidate(anchor, proposal, candidate.similarity),
          };
        }),
    );

    return {
      targets: deduplicateTargets(targets)
      .filter((candidate) => candidate.similarity >= minimumSimilarity)
      .sort((left, right) =>
        right.rank - left.rank ||
        formatTarget(left).localeCompare(formatTarget(right)),
      )
      .slice(0, maximumCandidates)
      .map(({ proposal, similarity }) => ({ proposal, similarity })),
      skippedFiles: scan.skippedFiles,
      cancelled: scan.cancelled,
    };
  }
}

const minimumSimilarity = 0.3;
const maximumCandidates = 20;

function rankCandidate(
  anchor: TourAnchor,
  proposal: AnchorProposal,
  textualSimilarity: number,
): number {
  const sameFile = normalizeFile(anchor.file) === normalizeFile(proposal.file) ? 0.04 : 0;
  const sameSymbol = lastSymbolSegment(anchor.symbol) === lastSymbolSegment(proposal.symbol) ? 0.06 : 0;
  return textualSimilarity + sameFile + sameSymbol;
}

function deduplicateTargets(
  targets: readonly RankedAnchorRepairTarget[],
): RankedAnchorRepairTarget[] {
  const byReference = new Map<string, RankedAnchorRepairTarget>();
  for (const target of targets) {
    const key = formatTarget(target);
    const existing = byReference.get(key);
    if (!existing || target.rank > existing.rank) {
      byReference.set(key, target);
    }
  }
  return [...byReference.values()];
}

function formatTarget(target: AnchorRepairTarget): string {
  const { proposal } = target;
  return `${normalizeFile(proposal.file)}::${proposal.symbol}@${proposal.refinement ?? ""}`;
}

function normalizeFile(file: string): string {
  return file.replace(/\\/g, "/").replace(/^\.\//, "");
}

function lastSymbolSegment(symbol: string): string {
  return symbol.split(".").at(-1)?.replace(/#\d+$/, "") ?? symbol;
}
