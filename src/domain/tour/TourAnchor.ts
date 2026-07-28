export interface TourAnchorSnapshot {
  hash: string;
  text: string;
}

export interface TourAnchor {
  id: string;
  file: string;
  symbol: string;
  refinement?: string | null;
  snapshot?: TourAnchorSnapshot;
}

export enum AnchorHealth {
  Healthy = "healthy",
  Drifted = "drifted",
  Broken = "broken",
}
