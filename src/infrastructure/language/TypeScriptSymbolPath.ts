export interface TypeScriptSymbolPathSegment {
  readonly name: string;
  readonly ordinal?: number;
}

export interface TypeScriptSymbolPath {
  readonly segments: readonly TypeScriptSymbolPathSegment[];
}

export type TypeScriptRefinement =
  | { readonly kind: "if" | "for" | "switch"; readonly ordinal: number }
  | { readonly kind: "return"; readonly ordinal?: number }
  | { readonly kind: "call"; readonly name: string; readonly ordinal: number };

export class TypeScriptSymbolPathSyntaxError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TypeScriptSymbolPathSyntaxError";
  }
}

export function parseTypeScriptSymbolPath(value: string): TypeScriptSymbolPath {
  if (!value || value.includes("@") || value.includes("::")) {
    throw new TypeScriptSymbolPathSyntaxError(`Invalid TypeScript symbol-path '${value}'.`);
  }

  const segments = value.split(".").map(parseSegment);
  return { segments };
}

export function formatTypeScriptSymbolPath(path: TypeScriptSymbolPath): string {
  if (path.segments.length === 0) {
    throw new TypeScriptSymbolPathSyntaxError("A TypeScript symbol-path requires at least one segment.");
  }
  return path.segments.map((segment) => {
    validateSymbolName(segment.name);
    if (segment.ordinal === undefined) {
      return segment.name;
    }
    validateOrdinal(segment.ordinal);
    return `${segment.name}#${segment.ordinal}`;
  }).join(".");
}

export function parseTypeScriptRefinement(value: string): TypeScriptRefinement {
  const structural = /^(if|for|switch)\[(0|[1-9]\d*)]$/.exec(value);
  if (structural) {
    return { kind: structural[1] as "if" | "for" | "switch", ordinal: Number(structural[2]) };
  }

  const returnMatch = /^return(?:\[(0|[1-9]\d*)])?$/.exec(value);
  if (returnMatch) {
    return {
      kind: "return",
      ordinal: returnMatch[1] === undefined ? undefined : Number(returnMatch[1]),
    };
  }

  const call = /^call\(([^()]+)\)\[(0|[1-9]\d*)]$/.exec(value);
  const callName = call?.[1];
  if (callName && callName.trim() === callName) {
    return { kind: "call", name: callName, ordinal: Number(call[2]) };
  }

  throw new TypeScriptSymbolPathSyntaxError(`Invalid TypeScript refinement '${value}'.`);
}

export function formatTypeScriptRefinement(refinement: TypeScriptRefinement): string {
  if (refinement.kind === "return" && refinement.ordinal === undefined) {
    return "return";
  }
  const ordinal = refinement.ordinal;
  if (ordinal === undefined) {
    throw new TypeScriptSymbolPathSyntaxError("This refinement requires an ordinal.");
  }
  validateOrdinal(ordinal);
  if (refinement.kind === "call") {
    validateCallName(refinement.name);
    return `call(${refinement.name})[${ordinal}]`;
  }
  return `${refinement.kind}[${ordinal}]`;
}

export function refinementKey(refinement: TypeScriptRefinement): string {
  return refinement.kind === "call" ? `call(${refinement.name})` : refinement.kind;
}

function parseSegment(value: string): TypeScriptSymbolPathSegment {
  const match = /^(.+?)(?:#(0|[1-9]\d*))?$/.exec(value);
  const name = match?.[1];
  if (!name) {
    throw new TypeScriptSymbolPathSyntaxError(`Invalid TypeScript symbol segment '${value}'.`);
  }
  validateSymbolName(name);
  return {
    name,
    ordinal: match[2] === undefined ? undefined : Number(match[2]),
  };
}

function validateSymbolName(name: string): void {
  if (!name || name.trim() !== name || /[.#@\r\n]/.test(name)) {
    throw new TypeScriptSymbolPathSyntaxError(`Invalid TypeScript symbol name '${name}'.`);
  }
}

function validateOrdinal(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeScriptSymbolPathSyntaxError(`Invalid symbol ordinal '${value}'.`);
  }
}

function validateCallName(name: string): void {
  if (!name || name.trim() !== name || /[()\r\n]/.test(name)) {
    throw new TypeScriptSymbolPathSyntaxError(`Invalid call refinement name '${name}'.`);
  }
}
