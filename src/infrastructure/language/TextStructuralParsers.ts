import type { AnchorOffsetRange } from "../../application/anchors/SemanticAnchorAdapter";
import type {
  StructuralDocument,
  StructuralRefinement,
  StructuralSymbol,
} from "./StructuralSemanticAnchorAdapter";

interface DraftSymbol {
  readonly kind: "container" | "function";
  readonly name: string;
  readonly start: number;
  end: number;
  parent?: DraftSymbol;
  readonly refinements: StructuralRefinement[];
}

interface RubyBlock {
  readonly start: number;
  readonly symbol?: DraftSymbol;
  readonly refinement?: { owner: DraftSymbol; key: string };
}

type TextLanguage = "ruby" | "swift" | "csharp" | "kotlin";

export function parseRubyDocument(sourceText: string): StructuralDocument {
  const masked = maskSource(sourceText, "ruby");
  const lines = sourceLines(masked);
  const drafts: DraftSymbol[] = [];
  const blocks: RubyBlock[] = [];

  for (const line of lines) {
    const text = line.text;
    const closeCount = /^\s*(?:end\b\s*[;]?\s*)+$/.test(text)
      ? [...text.matchAll(/\bend\b/g)].length
      : 0;
    if (closeCount > 0) {
      for (let index = 0; index < closeCount; index += 1) closeRubyBlock(blocks, line.end);
      continue;
    }

    // `class << self` opens a body that `end` closes but names no reachable symbol.
    if (/^\s*class\s*<</.test(text)) {
      blocks.push({ start: line.start + firstNonWhitespace(text) });
      continue;
    }

    const container = /^\s*(?:class|module)\s+([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)/.exec(text);
    const method = /^\s*def\s+(?:self\.)?([A-Za-z_]\w*[!?=]?)/.exec(text);
    // A single-line definition (`def size; @items.size; end`) opens and closes on one line.
    const singleLine = Boolean(method) && /;\s*end\s*$/.test(text);
    if (container?.[1] || method?.[1]) {
      const parent = nearestRubySymbol(blocks);
      const qualifiedNames = method?.[1] ? [method[1]] : (container?.[1] ?? "").split("::");
      let currentParent = parent;
      let symbol: DraftSymbol | undefined;
      for (const name of qualifiedNames) {
        symbol = drafts.find((candidate) => candidate.name === name && candidate.parent === currentParent);
        if (!symbol) {
          symbol = {
            kind: method?.[1] ? "function" : "container",
            name,
            start: line.start + firstNonWhitespace(text),
            end: sourceText.length,
            parent: currentParent,
            refinements: [],
          };
          drafts.push(symbol);
        }
        currentParent = symbol;
      }
      if (!symbol) continue;
      if (singleLine) {
        symbol.end = line.end;
        addLineRefinements(symbol, masked, line.start, line.end, "ruby");
        continue;
      }
      blocks.push({ start: symbol.start, symbol });
      continue;
    }

    const owner = nearestRubyFunction(blocks);
    const structural = /^\s*(if|unless|for|while|until|case|begin)\b/.exec(text);
    const opensDoBlock = /\bdo\b(?:\s*\|[^|]*\|)?\s*$/.test(text);
    if (structural || opensDoBlock) {
      const keyword = structural?.[1];
      const key = keyword === "if" || keyword === "unless"
        ? "if"
        : keyword === "case" ? "switch" : "for";
      blocks.push({
        start: line.start + firstNonWhitespace(text),
        refinement: owner && keyword !== "begin" ? { owner, key } : undefined,
      });
    }
    if (owner) addLineRefinements(owner, masked, line.start, line.end, "ruby");
  }
  while (blocks.length > 0) closeRubyBlock(blocks, sourceText.length);
  return finalizeDrafts(drafts);
}

export function parseSwiftDocument(sourceText: string): StructuralDocument {
  const masked = maskSource(sourceText, "swift");
  const drafts: DraftSymbol[] = [];
  const extensions: Array<{ name: string; range: AnchorOffsetRange }> = [];
  const typePattern = /\b(class|struct|enum|protocol|actor|extension)\s+([A-Za-z_]\w*)[^\n{]*\{/g;
  for (const match of masked.matchAll(typePattern)) {
    const kind = match[1];
    const name = match[2];
    if (!kind || !name || match.index === undefined) continue;
    const open = match.index + match[0].lastIndexOf("{");
    const end = matchingBrace(masked, open);
    const range = { start: match.index, end };
    if (kind === "extension") extensions.push({ name, range });
    else drafts.push({ kind: "container", name, start: match.index, end, refinements: [] });
  }

  // `init`, `deinit`, and `subscript` are members an author points at as often as a `func`.
  const functionPattern = /\b(?:func\s+([A-Za-z_]\w*)|(init\??|deinit|subscript))\s*(?:<[^\n>{}]*>)?\s*(?:\([^{}]*\))?[^\n{]*\{/g;
  for (const match of masked.matchAll(functionPattern)) {
    const name = match[1] ?? match[2]?.replace("?", "");
    if (!name || match.index === undefined) continue;
    const open = match.index + match[0].lastIndexOf("{");
    const end = matchingBrace(masked, open);
    drafts.push({ kind: "function", name, start: match.index, end, refinements: [] });
  }

  for (const extension of extensions) {
    if (!drafts.some((candidate) => candidate.kind === "container" && candidate.name === extension.name)) {
      drafts.push({
        kind: "container",
        name: extension.name,
        start: extension.range.start,
        end: extension.range.end,
        refinements: [],
      });
    }
  }

  for (const draft of drafts) {
    const containing = drafts
      .filter((candidate) => candidate !== draft && candidate.kind === "container" && containsDraft(candidate, draft))
      .sort((left, right) => (left.end - left.start) - (right.end - right.start))[0];
    const extension = extensions
      .filter((candidate) => candidate.range.start <= draft.start && draft.end <= candidate.range.end)
      .sort((left, right) => rangeLength(left.range) - rangeLength(right.range))[0];
    draft.parent = extension
      ? drafts.find((candidate) =>
          candidate !== draft && candidate.kind === "container" && candidate.name === extension.name,
        )
      : containing;
  }
  const locals = dropLocalFunctions(drafts);
  for (const draft of drafts) {
    if (draft.kind === "function") {
      addBraceRefinements(draft, masked, "swift", nestedFunctionsOf(draft, [...drafts, ...locals]));
    }
  }
  return finalizeDrafts(drafts);
}

export function parseCSharpDocument(sourceText: string): StructuralDocument {
  const masked = maskSource(sourceText, "csharp");
  const drafts = collectBraceTypes(masked, /\b(class|struct|interface|record|enum)\s+([A-Za-z_]\w*)[^{};]*\{/g);
  const methodPattern = /\b(?:(?:public|private|protected|internal|static|virtual|override|abstract|async|sealed|extern|unsafe|partial|new)\s+)*(?:[A-Za-z_]\w*(?:\s*<[^{};()]*>)?(?:\[\])?\??\s+)([A-Za-z_]\w*)\s*\([^{};]*\)[^{;]*\{/g;
  collectBraceFunctions(masked, methodPattern, drafts);
  const expressionMethod = /\b(?:(?:public|private|protected|internal|static|virtual|override|async|sealed|unsafe|partial|new)\s+)*(?:[A-Za-z_]\w*(?:\s*<[^{};()]*>)?(?:\[\])?\??\s+)([A-Za-z_]\w*)\s*\([^{};]*\)\s*=>[^;\n]+;/g;
  collectExpressionFunctions(masked, expressionMethod, drafts);
  assignBraceParentsAndRefinements(drafts, masked, "csharp");
  return finalizeDrafts(drafts);
}

export function parseKotlinDocument(sourceText: string): StructuralDocument {
  const masked = maskSource(sourceText, "kotlin");
  const drafts = collectBraceTypes(
    masked,
    /\b((?:(?:data|sealed|open|abstract|enum|annotation|value)\s+)?class|interface|object)\s+([A-Za-z_]\w*)[^\n{]*\{/g,
  );
  const functionPattern = /\bfun\s+(?:[A-Za-z_]\w*(?:<[^{}()]*>)?\.)?([A-Za-z_]\w*)\s*(?:<[^{}()]*>)?\s*\([^{}]*\)[^={;\n]*\{/g;
  collectBraceFunctions(masked, functionPattern, drafts);
  const expressionFunction = /\bfun\s+(?:[A-Za-z_]\w*(?:<[^{}()]*>)?\.)?([A-Za-z_]\w*)\s*(?:<[^{}()]*>)?\s*\([^{}]*\)[^=;\n]*=\s*[^\n]+/g;
  collectExpressionFunctions(masked, expressionFunction, drafts);
  assignBraceParentsAndRefinements(drafts, masked, "kotlin");
  return finalizeDrafts(drafts);
}

function closeRubyBlock(blocks: RubyBlock[], end: number): void {
  const block = blocks.pop();
  if (!block) return;
  if (block.symbol) block.symbol.end = end;
  if (block.refinement) {
    block.refinement.owner.refinements.push({
      key: block.refinement.key,
      range: { start: block.start, end },
    });
  }
}

function nearestRubySymbol(blocks: readonly RubyBlock[]): DraftSymbol | undefined {
  return [...blocks].reverse().find((block) => block.symbol)?.symbol;
}

function nearestRubyFunction(blocks: readonly RubyBlock[]): DraftSymbol | undefined {
  return [...blocks].reverse().find((block) => block.symbol?.kind === "function")?.symbol;
}

function addBraceRefinements(
  owner: DraftSymbol,
  masked: string,
  language: Exclude<TextLanguage, "ruby">,
  nested: readonly DraftSymbol[] = [],
): void {
  const body = masked.slice(owner.start, owner.end);
  // Everything up to the end of the parameter list is the declaration, not the body.
  const parenOpen = masked.indexOf("(", owner.start);
  const signatureEnd = parenOpen >= 0 && parenOpen < owner.end
    ? matchingDelimiter(masked, parenOpen, "(", ")", owner.end)
    : owner.start;
  // A nested named function owns its own structure, exactly as the parser-backed adapters do.
  const belongsToOwner = (start: number): boolean =>
    start >= signatureEnd && !nested.some((child) => child.start <= start && start < child.end);

  const structural = /\b(if|for|foreach|while|switch|when)\b[^{};]*\{/g;
  for (const match of body.matchAll(structural)) {
    if (match.index === undefined) continue;
    const start = owner.start + match.index;
    if (!belongsToOwner(start)) continue;
    const open = start + match[0].lastIndexOf("{");
    owner.refinements.push({
      key: match[1] === "if" ? "if" : match[1] === "switch" || match[1] === "when" ? "switch" : "for",
      range: { start, end: matchingBrace(masked, open) },
    });
  }
  for (const line of sourceLines(body)) {
    addLineRefinements(
      owner,
      masked,
      owner.start + line.start,
      owner.start + line.end,
      language,
      belongsToOwner,
    );
  }
}

function addLineRefinements(
  owner: DraftSymbol,
  masked: string,
  start: number,
  end: number,
  language: TextLanguage,
  belongsToOwner: (position: number) => boolean = () => true,
): void {
  const line = masked.slice(start, end);
  const returnMatch = /\breturn\b[^;\n]*/.exec(line);
  if (returnMatch?.index !== undefined && belongsToOwner(start + returnMatch.index)) {
    owner.refinements.push({
      key: "return",
      range: trimRange(masked, start + returnMatch.index, start + returnMatch.index + returnMatch[0].length),
    });
  }
  const calls = /\b([A-Za-z_]\w*[!?]?(?:\.[A-Za-z_]\w*[!?]?)?)\s*\(/g;
  for (const match of line.matchAll(calls)) {
    const expression = match[1];
    if (!expression || match.index === undefined || isCallKeyword(expression, line.slice(0, match.index), language)) continue;
    if (!belongsToOwner(start + match.index)) continue;
    const open = start + match.index + match[0].lastIndexOf("(");
    const close = matchingDelimiter(masked, open, "(", ")", end);
    owner.refinements.push({
      key: `call(${expression.split(".").at(-1)})`,
      range: { start: start + match.index, end: close },
    });
  }
}

function isCallKeyword(expression: string, prefix: string, language: TextLanguage): boolean {
  const name = expression.split(".").at(-1) ?? expression;
  if (["if", "for", "while", "switch", "return", "class", "struct", "enum"].includes(name)) return true;
  if (language === "ruby") return /\bdef\s*$/.test(prefix);
  if (language === "kotlin") return /\bfun\s+(?:[A-Za-z_]\w*\.)?$/.test(prefix);
  return language === "swift" && /\bfunc\s*$/.test(prefix);
}

function collectBraceTypes(masked: string, pattern: RegExp): DraftSymbol[] {
  const drafts: DraftSymbol[] = [];
  for (const match of masked.matchAll(pattern)) {
    const name = match[2];
    if (!name || match.index === undefined) continue;
    const open = match.index + match[0].lastIndexOf("{");
    drafts.push({
      kind: "container",
      name,
      start: match.index,
      end: matchingBrace(masked, open),
      refinements: [],
    });
  }
  return drafts;
}

/** Control-flow keywords a declaration pattern can mistake for a member name (`else if (…) {`). */
const controlKeywords = new Set([
  "if", "else", "for", "foreach", "while", "do", "switch", "case", "catch", "finally",
  "lock", "using", "fixed", "when", "return", "throw", "yield", "new",
]);

function collectBraceFunctions(masked: string, pattern: RegExp, drafts: DraftSymbol[]): void {
  for (const match of masked.matchAll(pattern)) {
    const name = match[1];
    if (!name || match.index === undefined || controlKeywords.has(name)) continue;
    const open = match.index + match[0].lastIndexOf("{");
    drafts.push({
      kind: "function",
      name,
      start: match.index,
      end: matchingBrace(masked, open),
      refinements: [],
    });
  }
}

function collectExpressionFunctions(masked: string, pattern: RegExp, drafts: DraftSymbol[]): void {
  for (const match of masked.matchAll(pattern)) {
    const name = match[1];
    if (!name || match.index === undefined) continue;
    drafts.push({
      kind: "function",
      name,
      start: match.index,
      end: match.index + match[0].length,
      refinements: [],
    });
  }
}

function assignBraceParentsAndRefinements(
  drafts: DraftSymbol[],
  masked: string,
  language: "csharp" | "kotlin",
): void {
  for (const draft of drafts) {
    draft.parent = drafts
      .filter((candidate) => candidate !== draft && containsDraft(candidate, draft))
      .sort((left, right) => (left.end - left.start) - (right.end - right.start))[0];
  }
  const locals = dropLocalFunctions(drafts);
  for (const draft of drafts) {
    if (draft.kind === "function") {
      addBraceRefinements(draft, masked, language, nestedFunctionsOf(draft, [...drafts, ...locals]));
    }
  }
}

/**
 * Removes function-in-function declarations. A local function is as volatile as a closure, so
 * the specification (§4.4) does not allow it to become a path segment; selections inside one
 * snap to the enclosing named symbol and are narrowed with a refinement instead.
 */
function dropLocalFunctions(drafts: DraftSymbol[]): DraftSymbol[] {
  const isLocal = (draft: DraftSymbol): boolean => {
    for (let parent = draft.parent; parent; parent = parent.parent) {
      if (parent.kind === "function") return true;
    }
    return false;
  };
  const locals = new Set(drafts.filter((draft) => draft.kind === "function" && isLocal(draft)));
  if (locals.size === 0) {
    return [];
  }
  for (const draft of drafts) {
    while (draft.parent && locals.has(draft.parent)) {
      draft.parent = draft.parent.parent;
    }
  }
  for (let index = drafts.length - 1; index >= 0; index -= 1) {
    const draft = drafts[index];
    if (draft && locals.has(draft)) drafts.splice(index, 1);
  }
  return [...locals];
}

function nestedFunctionsOf(owner: DraftSymbol, drafts: readonly DraftSymbol[]): DraftSymbol[] {
  return drafts.filter((candidate) =>
    candidate !== owner && candidate.kind === "function" && containsDraft(owner, candidate));
}

function finalizeDrafts(drafts: readonly DraftSymbol[]): StructuralDocument {
  const mapping = new Map<DraftSymbol, StructuralSymbol>();
  for (const draft of drafts) {
    mapping.set(draft, {
      name: draft.name,
      range: { start: draft.start, end: draft.end },
      refinements: uniqueRefinements(draft.refinements),
    });
  }
  for (const draft of drafts) {
    const symbol = mapping.get(draft);
    if (symbol && draft.parent) symbol.parent = mapping.get(draft.parent);
  }
  return { symbols: [...mapping.values()] };
}

function uniqueRefinements(values: readonly StructuralRefinement[]): StructuralRefinement[] {
  return values.filter((value, index) =>
    values.findIndex((candidate) =>
      candidate.key === value.key && candidate.range.start === value.range.start && candidate.range.end === value.range.end,
    ) === index,
  );
}

function sourceLines(sourceText: string): Array<{ start: number; end: number; text: string }> {
  const result: Array<{ start: number; end: number; text: string }> = [];
  let start = 0;
  for (let index = 0; index <= sourceText.length; index += 1) {
    if (index === sourceText.length || sourceText[index] === "\n") {
      result.push({ start, end: index, text: sourceText.slice(start, index) });
      start = index + 1;
    }
  }
  return result;
}

function maskSource(sourceText: string, language: TextLanguage): string {
  const chars = [...(language === "ruby" ? maskRubyHeredocs(sourceText) : sourceText)];
  let quote: string | undefined;
  let verbatim = false;
  let lineComment = false;
  let blockDepth = 0;
  for (let index = 0; index < chars.length; index += 1) {
    const character = chars[index] ?? "";
    const next = chars[index + 1] ?? "";
    if (lineComment) {
      if (character === "\n") lineComment = false;
      else chars[index] = " ";
      continue;
    }
    if (blockDepth > 0) {
      if (character === "/" && next === "*") {
        blockDepth += 1;
        chars[index] = chars[index + 1] = " ";
        index += 1;
      } else if (character === "*" && next === "/") {
        blockDepth -= 1;
        chars[index] = chars[index + 1] = " ";
        index += 1;
      } else if (character !== "\n") chars[index] = " ";
      continue;
    }
    if (quote) {
      if (verbatim) {
        // In a C# verbatim string a backslash is literal and `""` escapes a quote.
        if (character === "\"" && next === "\"") {
          chars[index] = " ";
          chars[index + 1] = " ";
          index += 1;
        } else if (character === "\"") {
          chars[index] = " ";
          quote = undefined;
          verbatim = false;
        } else if (character !== "\n") {
          chars[index] = " ";
        }
        continue;
      }
      if (character === "\\") {
        chars[index] = " ";
        if (index + 1 < chars.length) chars[index + 1] = " ";
        index += 1;
      } else if (character === quote) {
        chars[index] = " ";
        quote = undefined;
      } else if (character !== "\n") chars[index] = " ";
      continue;
    }
    if ((language === "ruby" && character === "#") || (language !== "ruby" && character === "/" && next === "/")) {
      lineComment = true;
      chars[index] = " ";
      if (language !== "ruby") {
        chars[index + 1] = " ";
        index += 1;
      }
    } else if (language !== "ruby" && character === "/" && next === "*") {
      blockDepth = 1;
      chars[index] = chars[index + 1] = " ";
      index += 1;
    } else if (language === "csharp" && character === "@" && next === "\"") {
      quote = "\"";
      verbatim = true;
      chars[index] = " ";
      chars[index + 1] = " ";
      index += 1;
    } else if (character === "\"" || character === "'" || (language === "ruby" && character === "`")) {
      quote = character;
      chars[index] = " ";
    }
  }
  return chars.join("");
}

/**
 * Blanks heredoc bodies before the generic masker runs. Their contents are data, and an `end`
 * inside one would otherwise close the enclosing class or method.
 */
function maskRubyHeredocs(sourceText: string): string {
  const chars = [...sourceText];
  let terminator: string | undefined;
  for (const line of sourceLines(sourceText)) {
    if (terminator) {
      const closes = line.text.trim() === terminator;
      for (let index = line.start; index < line.end; index += 1) chars[index] = " ";
      if (closes) terminator = undefined;
      continue;
    }
    const opener = /<<[-~]?(?:"([A-Za-z_]\w*)"|'([A-Za-z_]\w*)'|([A-Z_]\w*))/.exec(line.text);
    terminator = opener?.[1] ?? opener?.[2] ?? opener?.[3];
  }
  return chars.join("");
}

function matchingBrace(sourceText: string, open: number): number {
  return matchingDelimiter(sourceText, open, "{", "}", sourceText.length);
}

function matchingDelimiter(sourceText: string, open: number, left: string, right: string, limit: number): number {
  let depth = 0;
  for (let index = open; index < limit; index += 1) {
    if (sourceText[index] === left) depth += 1;
    if (sourceText[index] === right) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return limit;
}

function trimRange(sourceText: string, rawStart: number, rawEnd: number): AnchorOffsetRange {
  let start = rawStart;
  let end = rawEnd;
  while (start < end && /\s/.test(sourceText[start] ?? "")) start += 1;
  while (end > start && /\s/.test(sourceText[end - 1] ?? "")) end -= 1;
  return { start, end };
}

function firstNonWhitespace(value: string): number {
  return value.search(/\S|$/);
}

function containsDraft(outer: DraftSymbol, inner: DraftSymbol): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

function rangeLength(range: AnchorOffsetRange): number {
  return range.end - range.start;
}
