import type { Memento } from "vscode";
import type { TourSourceBindingStore } from "../../application/tours/TourSourceBinding";
import type { TourScope } from "../../domain/tour/TourScope";

const storageKey = "konstelia.tourSourceBindings";

export class VsCodeTourSourceBindingStore implements TourSourceBindingStore {
  public constructor(private readonly state: Memento) {}

  public get(scope: TourScope, tourId: string): Promise<string | undefined> {
    return Promise.resolve(this.state.get<Record<string, string>>(storageKey)?.[key(scope, tourId)]);
  }

  public async set(scope: TourScope, tourId: string, sourceRoot: string): Promise<void> {
    const bindings = this.state.get<Record<string, string>>(storageKey) ?? {};
    await this.state.update(storageKey, { ...bindings, [key(scope, tourId)]: sourceRoot });
  }
}

function key(scope: TourScope, tourId: string): string {
  return `${scope}:${tourId}`;
}
