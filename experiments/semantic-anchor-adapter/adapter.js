// Spike ①: TypeScript adapter — reverse transformation (selection Range → symbol-path [+refinement])
// Question: どこまで一意な anchor を生成できるか。生成後に順変換(resolve)で往復検証する。
const ts = require("typescript");

// ---------- naming: which nodes are "named symbols" ----------
// Returns a name string, or null if the node is not a nameable symbol.
function symbolName(node) {
  const k = ts.SyntaxKind;
  switch (node.kind) {
    case k.FunctionDeclaration:
    case k.ClassDeclaration:
    case k.InterfaceDeclaration:
    case k.EnumDeclaration:
      return node.name ? node.name.text : null; // export default class {} → nameless
    case k.ModuleDeclaration:
      return node.name.text;
    case k.MethodDeclaration:
    case k.PropertyDeclaration: {
      const n = propName(node.name);
      if (n === null) return null; // computed property
      // property must hold a function-ish initializer to be a callable symbol,
      // but for anchoring we allow any named class member.
      return n;
    }
    case k.GetAccessor: {
      const n = propName(node.name);
      return n === null ? null : n + "[get]";
    }
    case k.SetAccessor: {
      const n = propName(node.name);
      return n === null ? null : n + "[set]";
    }
    case k.Constructor:
      return "constructor";
    case k.VariableDeclaration: {
      // const foo = () => {} / function expr / plain value
      if (!ts.isIdentifier(node.name)) return null; // destructuring pattern → nameless
      // 原則の系: 関数ローカルの名前はパスセグメントにしない(揮発的すぎる)。
      // module / namespace スコープの宣言のみ名前付きシンボルとして扱う。
      let p = node.parent; // VariableDeclarationList
      p = p && p.parent;   // VariableStatement
      p = p && p.parent;   // SourceFile | ModuleBlock | Block(関数内)
      if (p && (p.kind === k.SourceFile || p.kind === k.ModuleBlock)) return node.name.text;
      return null;
    }
    case k.PropertyAssignment: {
      // object literal: { onLogin() {} } handled as MethodDeclaration? No — that's
      // k.MethodDeclaration inside ObjectLiteral too. PropertyAssignment: { a: () => {} }
      const n = propName(node.name);
      return n;
    }
    default:
      return null;
  }
}

function propName(nameNode) {
  if (!nameNode) return null;
  if (ts.isIdentifier(nameNode) || ts.isStringLiteral(nameNode) || ts.isNumericLiteral(nameNode))
    return nameNode.text;
  return null; // ComputedPropertyName etc.
}

// ---------- build chain of named symbols from root to the smallest named node covering [start,end) ----------
function containing(node, start, end) {
  return node.getStart() <= start && end <= node.getEnd();
}

function namedChainFor(sf, start, end) {
  const chain = [];
  function descend(node) {
    for (const child of node.getChildren(sf)) {
      if (containing(child, start, end)) {
        const name = symbolName(child);
        if (name !== null) chain.push(child);
        descend(child);
        return;
      }
    }
  }
  descend(sf);
  return chain;
}

// ordinal among same-name same-scope symbols (overloads, redeclarations)
function ordinalOf(sf, node) {
  const name = symbolName(node);
  // scope = nearest ancestor that is a named symbol or the source file
  let scope = node.parent;
  while (scope && scope.kind !== ts.SyntaxKind.SourceFile && symbolName(scope) === null)
    scope = scope.parent;
  const peers = [];
  (function collect(n) {
    for (const c of n.getChildren(sf)) {
      if (c === node || symbolName(c) === null || c.kind === node.kind || true) {
        if (symbolName(c) === name && sameLogicalScope(c, scope)) peers.push(c);
        if (symbolName(c) === null) collect(c); // don't descend into other named symbols
      }
    }
  })(scope === undefined ? sf : scope);
  peers.sort((a, b) => a.getStart() - b.getStart());
  return { index: peers.indexOf(node), total: peers.length };
}

function sameLogicalScope(node, scope) {
  let p = node.parent;
  while (p && symbolName(p) === null && p.kind !== ts.SyntaxKind.SourceFile) p = p.parent;
  return p === scope || (p && scope && p.kind === ts.SyntaxKind.SourceFile && scope.kind === ts.SyntaxKind.SourceFile);
}

// ---------- refinement inside the innermost symbol ----------
const REFINEMENT_KINDS = [
  { kinds: [ts.SyntaxKind.IfStatement], tag: "if" },
  { kinds: [ts.SyntaxKind.ForStatement, ts.SyntaxKind.ForOfStatement, ts.SyntaxKind.ForInStatement], tag: "for" },
  { kinds: [ts.SyntaxKind.SwitchStatement], tag: "switch" },
  { kinds: [ts.SyntaxKind.ReturnStatement], tag: "return" },
  { kinds: [ts.SyntaxKind.CallExpression], tag: "call" },
];

function calleeName(callExpr) {
  const e = callExpr.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return null;
}

function refinementFor(sf, symbolNode, start, end) {
  // collect all refinement-eligible nodes inside symbolNode, but do not descend into nested *named* symbols
  const found = [];
  (function walk(n) {
    for (const c of n.getChildren(sf)) {
      if (c !== symbolNode && symbolName(c) !== null) continue; // nested named symbol boundary
      for (const spec of REFINEMENT_KINDS) {
        if (spec.kinds.includes(c.kind)) {
          const key = spec.tag === "call" ? `call(${calleeName(c) ?? "?"})` : spec.tag;
          found.push({ node: c, tag: spec.tag, key });
        }
      }
      walk(c);
    }
  })(symbolNode);
  // candidates that contain the selection; pick smallest
  const containingCands = found.filter((f) => containing(f.node, start, end));
  if (containingCands.length === 0) return { refinement: null, snapped: false };
  containingCands.sort((a, b) => (a.node.getEnd() - a.node.getStart()) - (b.node.getEnd() - b.node.getStart()));
  const best = containingCands[0];
  // ordinal among same-key refinement nodes in source order
  const sameKey = found.filter((f) => f.key === best.key).sort((a, b) => a.node.getStart() - b.node.getStart());
  const idx = sameKey.indexOf(best);
  const exact = best.node.getStart() === start && best.node.getEnd() === end;
  return {
    refinement: `@${best.key}[${idx}]`,
    refNode: best.node,
    snapped: !exact,
    snapRatio: (best.node.getEnd() - best.node.getStart()) / Math.max(1, end - start),
  };
}

// ---------- generate ----------
function normalizeSelection(sf, start, end) {
  const text = sf.getFullText();
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /[\s;]/.test(text[end - 1])) end--;
  return [start, end];
}

function generateAnchor(sf, rawStart, rawEnd) {
  const [start, end] = normalizeSelection(sf, rawStart, rawEnd);
  const chain = namedChainFor(sf, start, end);
  if (chain.length === 0)
    return { ok: false, reason: "no named symbol contains the selection (top-level anonymous code)" };

  const inner = chain[chain.length - 1];
  const segs = chain.map((n) => {
    const { index, total } = ordinalOf(sf, n);
    return total > 1 ? `${symbolName(n)}#${index}` : symbolName(n);
  });

  const innerExact = inner.getStart() === start && inner.getEnd() === end;
  let refinement = null, snapped = false, snapNote = "";
  if (!innerExact) {
    const r = refinementFor(sf, inner, start, end);
    if (r.refinement) {
      refinement = r.refinement;
      snapped = r.snapped;
      if (snapped) snapNote = `snapped to ${refinement} (x${r.snapRatio.toFixed(1)} of selection)`;
    } else {
      snapped = true;
      snapNote = "no structural refinement matches → snapped to whole symbol";
    }
  }
  const path = segs.join(".") + (refinement ?? "");
  return { ok: true, path, snapped, snapNote, node: refinement ? undefined : inner };
}

// ---------- forward resolve (round-trip verification) ----------
function resolvePath(sf, path) {
  const m = path.match(/^([^@]+)(@.+)?$/);
  const segs = m[1].split(".");
  const refStr = m[2] || null;
  let scopeNodes = [sf];
  for (const seg of segs) {
    const sm = seg.match(/^(.+?)(?:#(\d+))?$/);
    const [, name, ordStr] = sm;
    const matches = [];
    for (const scope of scopeNodes) {
      (function collect(n) {
        for (const c of n.getChildren(sf)) {
          if (symbolName(c) === name) matches.push(c);
          else if (symbolName(c) === null) collect(c);
        }
      })(scope);
    }
    matches.sort((a, b) => a.getStart() - b.getStart());
    const picked = ordStr !== undefined ? [matches[+ordStr]].filter(Boolean) : matches;
    if (picked.length === 0) return { ok: false, reason: `unresolved segment '${seg}'` };
    if (picked.length > 1) return { ok: false, reason: `ambiguous segment '${seg}' (${picked.length} candidates)` };
    scopeNodes = picked;
  }
  let node = scopeNodes[0];
  if (refStr) {
    const rm = refStr.match(/^@(if|for|switch|return|call\(([^)]*)\))\[(\d+)\]$/);
    if (!rm) return { ok: false, reason: `bad refinement syntax '${refStr}'` };
    const keyWanted = rm[1];
    const idx = +rm[3];
    const found = [];
    (function walk(n) {
      for (const c of n.getChildren(sf)) {
        if (c !== node && symbolName(c) !== null) continue;
        for (const spec of REFINEMENT_KINDS) {
          if (spec.kinds.includes(c.kind)) {
            const key = spec.tag === "call" ? `call(${calleeName(c) ?? "?"})` : spec.tag;
            if (key === keyWanted) found.push(c);
          }
        }
        walk(c);
      }
    })(node);
    found.sort((a, b) => a.getStart() - b.getStart());
    if (!found[idx]) return { ok: false, reason: `refinement ${refStr} not found (have ${found.length})` };
    node = found[idx];
  }
  return { ok: true, node };
}

module.exports = { generateAnchor, resolvePath };
