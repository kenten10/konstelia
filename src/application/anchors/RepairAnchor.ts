import { formatAnchorReference } from "../../domain/tour/AnchorReference";
import { AnchorHealth, type TourAnchor } from "../../domain/tour/TourAnchor";
import type { TourScope } from "../../domain/tour/TourScope";
import type { TourAnchorRegistryResolver } from "../tours/TourAnchorRegistry";
import {
  proposeAnchor,
  type AnchorProposal,
  type ProposeAnchorInput,
} from "./CreateAnchor";
import { ResolveAnchor } from "./ResolveAnchor";
import type { SemanticAnchorAdapter } from "./SemanticAnchorAdapter";
import type { AnchorSourceCatalog } from "./AnchorSourceCatalog";
import { createAnchorSnapshot } from "./AnchorSnapshot";

export interface RepairAnchorCandidate {
  readonly anchor: TourAnchor;
  readonly health?: AnchorHealth;
  readonly reason?: string;
  readonly reference: string;
}

export interface RepairAnchorPreparation {
  readonly proposal: AnchorProposal;
  readonly candidates: readonly RepairAnchorCandidate[];
}

export class RepairAnchor {
  private readonly resolver: ResolveAnchor;

  public constructor(
    private readonly adapter: SemanticAnchorAdapter,
    private readonly registryResolver: TourAnchorRegistryResolver,
    private readonly sourceCatalog: AnchorSourceCatalog,
  ) {
    this.resolver = new ResolveAnchor(adapter);
  }

  public async prepare(
    scope: TourScope,
    input: ProposeAnchorInput,
  ): Promise<RepairAnchorPreparation> {
    const proposal = proposeAnchor(this.adapter, input);
    const anchors = await this.registryResolver.resolve(scope).loadAnchors();
    const candidates = anchors
      .map((anchor): RepairAnchorCandidate => {
        if (normalizeFile(anchor.file) !== normalizeFile(input.file)) {
          return {
            anchor,
            reference: formatAnchorReference(anchor),
            reason: `Currently targets ${anchor.file}.`,
          };
        }
        const resolution = this.resolver.execute(anchor, input.sourceText);
        return {
          anchor,
          health: resolution.health,
          reason: resolution.reason,
          reference: formatAnchorReference(anchor),
        };
      })
      .sort((left, right) =>
        healthOrder(left.health) - healthOrder(right.health) ||
        left.anchor.id.localeCompare(right.anchor.id),
      );
    return { proposal, candidates };
  }

  public async rebind(
    scope: TourScope,
    anchorId: string,
    proposal: AnchorProposal,
  ): Promise<TourAnchor> {
    const registry = this.registryResolver.resolve(scope);
    const anchor = (await registry.loadAnchors()).find((candidate) => candidate.id === anchorId);
    if (!anchor) {
      throw new Error(`Anchor id '${anchorId}' does not exist in ${scope} storage.`);
    }
    const sourceText = await this.sourceCatalog.readSource(proposal.file);
    if (sourceText === undefined) {
      throw new Error(
        `Repair target '${proposal.file}' is no longer available. Discover the candidate again.`,
      );
    }
    const resolution = this.adapter.resolve(
      sourceText,
      proposal.file,
      proposal.symbol,
      proposal.refinement,
    );
    if (!resolution.ok) {
      throw new Error(`Repair target changed: ${resolution.reason} Discover the candidate again.`);
    }
    const currentSnapshot = createAnchorSnapshot(
      sourceText.slice(resolution.range.start, resolution.range.end),
    );
    if (currentSnapshot.hash !== proposal.snapshot.hash) {
      throw new Error("Repair target changed while it was being reviewed. Discover the candidate again.");
    }
    const replacement: TourAnchor = {
      ...anchor,
      file: proposal.file,
      symbol: proposal.symbol,
      refinement: proposal.refinement,
      snapshot: currentSnapshot,
    };
    await registry.replaceAnchor(replacement);
    return replacement;
  }
}

function normalizeFile(file: string): string {
  return file.replace(/\\/g, "/").replace(/^\.\//, "");
}

function healthOrder(health: AnchorHealth | undefined): number {
  if (health === AnchorHealth.Broken) return 0;
  if (health === AnchorHealth.Drifted) return 1;
  if (health === AnchorHealth.Healthy) return 2;
  return 3;
}
