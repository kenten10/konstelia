export enum TourScope {
  Personal = "personal",
  Workspace = "workspace",
  Repository = "repository",
}

export interface TourScopeChoice {
  readonly label: string;
  readonly description: string;
  readonly scope: TourScope;
}

/** How the scopes are described when the author is choosing where a tour lives. */
export const tourScopeChoices: readonly TourScopeChoice[] = [
  { label: "Personal", description: "Private tours for this VS Code user", scope: TourScope.Personal },
  { label: "Workspace", description: "Private tours for this workspace", scope: TourScope.Workspace },
  { label: "Repository", description: "Tours shared with repository collaborators", scope: TourScope.Repository },
];

/** The same scopes, described for an anchor registry rather than for a tour. */
export const anchorScopeChoices: readonly TourScopeChoice[] = [
  { label: "Personal", description: "Private to your VS Code user", scope: TourScope.Personal },
  { label: "Workspace", description: "Private to this workspace", scope: TourScope.Workspace },
  { label: "Repository", description: "Shared with repository collaborators", scope: TourScope.Repository },
];
