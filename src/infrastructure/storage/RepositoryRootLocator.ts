import type { Uri } from "vscode";
import { ScopeUnavailableError } from "../../shared/errors/KonsteliaError";

export interface RepositoryRootLocator {
  getRoot(): Uri;
}

export class FixedRepositoryRootLocator implements RepositoryRootLocator {
  public constructor(private readonly root: Uri) {}

  public getRoot(): Uri {
    return this.root;
  }
}

export class SingleRootWorkspaceLocator implements RepositoryRootLocator {
  public constructor(private readonly getWorkspaceRoots: () => readonly Uri[] | undefined) {}

  public getRoot(): Uri {
    const root = this.getWorkspaceRoots()?.[0];
    if (!root) {
      throw new ScopeUnavailableError("Repository tour storage requires an open workspace.");
    }
    return root;
  }
}
