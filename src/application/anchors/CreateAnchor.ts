import type { TourAnchor, TourAnchorSnapshot } from "../../domain/tour/TourAnchor";
import type { TourScope } from "../../domain/tour/TourScope";
import type { TourAnchorRegistryResolver } from "../tours/TourAnchorRegistry";
import { createAnchorSnapshot } from "./AnchorSnapshot";
import type {
  AnchorOffsetRange,
  GeneratedSemanticAnchor,
  SemanticAnchorAdapter,
} from "./SemanticAnchorAdapter";

export interface ProposeAnchorInput {
  file: string;
  sourceText: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface AnchorProposal {
  file: string;
  symbol: string;
  refinement?: string;
  snapshot: TourAnchorSnapshot;
  range: AnchorOffsetRange;
  suggestedId: string;
  snapped: boolean;
  note?: string;
}

export class CreateAnchor {
  public constructor(
    private readonly adapter: SemanticAnchorAdapter,
    private readonly registryResolver: TourAnchorRegistryResolver,
  ) {}

  public propose(input: ProposeAnchorInput): AnchorProposal {
    return proposeAnchor(this.adapter, input);
  }

  public async save(scope: TourScope, id: string, proposal: AnchorProposal): Promise<TourAnchor> {
    const normalizedId = id.trim();
    if (!normalizedId) {
      throw new Error("Anchor id is required.");
    }
    const anchor: TourAnchor = {
      id: normalizedId,
      file: proposal.file,
      symbol: proposal.symbol,
      refinement: proposal.refinement,
      snapshot: proposal.snapshot,
    };
    await this.registryResolver.resolve(scope).saveAnchor(anchor);
    return anchor;
  }
}

export function proposeAnchor(
  adapter: SemanticAnchorAdapter,
  input: ProposeAnchorInput,
): AnchorProposal {
  const result = adapter.generate(
    input.sourceText,
    input.file,
    input.selectionStart,
    input.selectionEnd,
  );
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return createAnchorProposal(input, result.target);
}

export function createAnchorProposal(
  input: ProposeAnchorInput,
  target: GeneratedSemanticAnchor,
): AnchorProposal {
  return {
    file: input.file,
    symbol: target.symbol,
    refinement: target.refinement,
    snapshot: createAnchorSnapshot(input.sourceText.slice(target.range.start, target.range.end)),
    range: target.range,
    suggestedId: suggestAnchorId(input.file, target.symbol, target.refinement),
    snapped: target.snapped,
    note: target.note,
  };
}

function suggestAnchorId(file: string, symbol: string, refinement?: string): string {
  const fileStem = file.replace(/\.[^.]+$/, "");
  const suggested = [fileStem, symbol, refinement]
    .filter((part): part is string => Boolean(part))
    .join(".")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return suggested || "anchor";
}
