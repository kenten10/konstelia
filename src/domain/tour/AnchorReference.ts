import type { TourAnchor } from "./TourAnchor";

export function formatAnchorReference(
  anchor: Pick<TourAnchor, "file" | "symbol" | "refinement">,
): string {
  return `${anchor.file}::${anchor.symbol}${anchor.refinement ? `@${anchor.refinement}` : ""}`;
}
