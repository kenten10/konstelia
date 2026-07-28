import { TypeScriptAnchorAdapter } from "./TypeScriptAnchorAdapter";

export interface SymbolOffsetRange {
  start: number;
  end: number;
}

export function resolveTypeScriptSymbol(
  sourceText: string,
  fileName: string,
  symbolPath: string,
): SymbolOffsetRange | undefined {
  const result = new TypeScriptAnchorAdapter().resolve(sourceText, fileName, symbolPath);
  return result.ok ? result.range : undefined;
}
