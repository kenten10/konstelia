export interface TourAnchorReference {
  ref: string;
  emphasis: "primary" | "secondary";
}

export interface TourHop {
  summary: string;
  body?: string;
  anchors: TourAnchorReference[];
}

export interface TourLink {
  to: string;
  label: string;
}

export interface TourStep {
  id: string;
  title: string;
  hops: TourHop[];
  links?: TourLink[];
}

export interface TourDocument {
  id: string;
  title: string;
  description?: string;
  prerequisites?: string[];
  steps: TourStep[];
}
