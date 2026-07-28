import { AnchorHealth } from "../../domain/tour/TourAnchor";
import type { TourDocument, TourHop, TourStep } from "../../domain/tour/TourDocument";

export type TourPlayerStatus = "playing" | "completed" | "exited";

export interface TourPlayerState {
  readonly tourId: string;
  readonly stepIndex: number;
  readonly hopIndex: number;
  readonly health: AnchorHealth;
  readonly status: TourPlayerStatus;
}

export interface TourPlayerPosition {
  readonly step: TourStep;
  readonly hop: TourHop;
  readonly stepIndex: number;
  readonly hopIndex: number;
  readonly ordinal: number;
  readonly total: number;
}

export type TourPlayerListener = (state: TourPlayerState) => void;

export class TourPlayer {
  private state: TourPlayerState;
  private readonly listeners = new Set<TourPlayerListener>();
  private readonly positions: TourPlayerPosition[];

  public constructor(private readonly tour: TourDocument) {
    this.positions = flattenTour(tour);
    if (this.positions.length === 0) {
      throw new Error(`Tour '${tour.title}' has no hops to play.`);
    }
    this.state = this.createState(0, "playing", AnchorHealth.Healthy);
  }

  public getState(): TourPlayerState {
    return this.state;
  }

  public getCurrent(): TourPlayerPosition | undefined {
    return this.positions.find(
      ({ stepIndex, hopIndex }) =>
        stepIndex === this.state.stepIndex && hopIndex === this.state.hopIndex,
    );
  }

  public canPrevious(): boolean {
    return this.currentOrdinal() > 0 && this.state.status === "playing";
  }

  public canNext(): boolean {
    return this.currentOrdinal() < this.positions.length - 1 && this.state.status === "playing";
  }

  public next(): TourPlayerState {
    if (this.state.status !== "playing") {
      return this.state;
    }
    const ordinal = this.currentOrdinal();
    if (ordinal === this.positions.length - 1) {
      return this.update({ ...this.state, status: "completed" });
    }
    return this.moveToOrdinal(ordinal + 1);
  }

  public previous(): TourPlayerState {
    if (!this.canPrevious()) {
      return this.state;
    }
    return this.moveToOrdinal(this.currentOrdinal() - 1);
  }

  public gotoStep(stepIndex: number): TourPlayerState {
    return this.gotoHop(stepIndex, 0);
  }

  public gotoHop(stepIndex: number, hopIndex: number): TourPlayerState {
    if (this.state.status !== "playing") {
      return this.state;
    }
    const ordinal = this.positions.findIndex(
      (position) => position.stepIndex === stepIndex && position.hopIndex === hopIndex,
    );
    if (ordinal < 0) {
      throw new RangeError(`Tour position ${stepIndex}:${hopIndex} does not exist.`);
    }
    return this.moveToOrdinal(ordinal);
  }

  public setHealth(health: AnchorHealth): TourPlayerState {
    if (this.state.health === health) {
      return this.state;
    }
    return this.update({ ...this.state, health });
  }

  public exit(): TourPlayerState {
    if (this.state.status === "exited") {
      return this.state;
    }
    return this.update({ ...this.state, status: "exited" });
  }

  public subscribe(listener: TourPlayerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private currentOrdinal(): number {
    return this.getCurrent()?.ordinal ?? 0;
  }

  private moveToOrdinal(ordinal: number): TourPlayerState {
    return this.update(this.createState(ordinal, "playing", AnchorHealth.Healthy));
  }

  private createState(
    ordinal: number,
    status: TourPlayerStatus,
    health: AnchorHealth,
  ): TourPlayerState {
    const position = this.positions[ordinal];
    if (!position) {
      throw new RangeError(`Tour position ${ordinal} does not exist.`);
    }
    return {
      tourId: this.tour.id,
      stepIndex: position.stepIndex,
      hopIndex: position.hopIndex,
      health,
      status,
    };
  }

  private update(state: TourPlayerState): TourPlayerState {
    this.state = state;
    for (const listener of this.listeners) {
      listener(state);
    }
    return state;
  }
}

function flattenTour(tour: TourDocument): TourPlayerPosition[] {
  const positions: TourPlayerPosition[] = [];
  for (const [stepIndex, step] of tour.steps.entries()) {
    for (const [hopIndex, hop] of step.hops.entries()) {
      positions.push({
        step,
        hop,
        stepIndex,
        hopIndex,
        ordinal: positions.length,
        total: 0,
      });
    }
  }
  return positions.map((position) => ({ ...position, total: positions.length }));
}
