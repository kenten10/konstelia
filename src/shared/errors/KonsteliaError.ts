export class KonsteliaError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ScopeUnavailableError extends KonsteliaError {}

export class FeatureUnavailableError extends KonsteliaError {}
