import type { SyntaxNode } from "@lezer/common";
import { parser as cppParser } from "@lezer/cpp";
import { parser as goParser } from "@lezer/go";
import { parser as javaParser } from "@lezer/java";
import { parser as rustParser } from "@lezer/rust";
import type {
  StructuralDocument,
  StructuralRefinement,
  StructuralSymbol,
} from "./StructuralSemanticAnchorAdapter";

export function parseGoDocument(sourceText: string): StructuralDocument {
  const root = goParser.parse(sourceText).topNode;
  const symbols: StructuralSymbol[] = [];
  const types = new Map<string, StructuralSymbol>();

  for (const node of descendants(root)) {
    if (node.name === "TypeSpec" && node.parent?.name === "TypeDecl") {
      const name = childText(node, "DefName", sourceText);
      if (name) {
        const symbol = makeSymbol(name, node);
        symbols.push(symbol);
        if (!types.has(name)) types.set(name, symbol);
      }
    }
  }
  for (const node of descendants(root)) {
    if (node.name !== "FunctionDecl" && node.name !== "MethodDecl") continue;
    const name = childText(node, node.name === "MethodDecl" ? "FieldName" : "DefName", sourceText);
    if (!name) continue;
    const symbol = makeSymbol(name, node);
    if (node.name === "MethodDecl") {
      const receiver = children(node).find((child) => child.name === "Parameters");
      const receiverType = receiver
        ? descendants(receiver).find((child) => child.name === "TypeName")
        : undefined;
      if (receiverType) {
        const typeName = sourceText.slice(receiverType.from, receiverType.to);
        symbol.parent = types.get(typeName) ?? addVirtualType(types, symbols, typeName, receiverType);
      }
    }
    symbol.refinements.push(...collectLezerRefinements(node, sourceText, goRefinementKey));
    symbols.push(symbol);
  }
  return { symbols };
}

export function parseJavaDocument(sourceText: string): StructuralDocument {
  const root = javaParser.parse(sourceText).topNode;
  const symbols: StructuralSymbol[] = [];
  const nodes = new Map<string, StructuralSymbol>();
  const typeKinds = new Set([
    "ClassDeclaration",
    "InterfaceDeclaration",
    "EnumDeclaration",
    "RecordDeclaration",
    "AnnotationTypeDeclaration",
  ]);

  for (const node of descendants(root)) {
    if (!typeKinds.has(node.name)) continue;
    const name = childText(node, "Definition", sourceText);
    if (!name) continue;
    const symbol = makeSymbol(name, node);
    const parent = nearestAncestor(node, typeKinds);
    if (parent) symbol.parent = nodes.get(nodeKey(parent));
    nodes.set(nodeKey(node), symbol);
    symbols.push(symbol);
  }
  for (const node of descendants(root)) {
    if (node.name !== "MethodDeclaration" && node.name !== "ConstructorDeclaration") continue;
    const name = childText(node, "Definition", sourceText);
    if (!name) continue;
    const symbol = makeSymbol(name, node);
    const parent = nearestAncestor(node, typeKinds);
    if (parent) symbol.parent = nodes.get(nodeKey(parent));
    symbol.refinements.push(...collectLezerRefinements(node, sourceText, javaRefinementKey));
    symbols.push(symbol);
  }
  return { symbols };
}

export function parseCppDocument(sourceText: string): StructuralDocument {
  const root = cppParser.parse(sourceText).topNode;
  const symbols: StructuralSymbol[] = [];
  const nodes = new Map<string, StructuralSymbol>();
  const containers = new Map<string, StructuralSymbol>();
  const typeKinds = new Set(["ClassSpecifier", "StructSpecifier", "UnionSpecifier", "EnumSpecifier"]);

  for (const node of descendants(root)) {
    if (!typeKinds.has(node.name) && node.name !== "NamespaceDefinition") continue;
    const nameNode = descendants(node).find((child) =>
      child.name === "TypeIdentifier" ||
      (node.name === "NamespaceDefinition" && child.name === "Identifier"),
    );
    if (!nameNode) continue;
    const name = sourceText.slice(nameNode.from, nameNode.to);
    const symbol = makeSymbol(name, node);
    const parentNode = nearestAncestor(node, new Set([...typeKinds, "NamespaceDefinition"]));
    if (parentNode) symbol.parent = nodes.get(nodeKey(parentNode));
    nodes.set(nodeKey(node), symbol);
    symbols.push(symbol);
    containers.set(name, symbol);
  }

  for (const node of descendants(root)) {
    if (node.name !== "FunctionDefinition") continue;
    const declarator = descendants(node).find((child) => child.name === "FunctionDeclarator");
    if (!declarator) continue;
    const target = children(declarator).find((child) => child.name !== "ParameterList");
    if (!target) continue;
    const scoped = target.name === "ScopedIdentifier"
      ? target
      : descendants(target).find((child) => child.name === "ScopedIdentifier");
    const identifierRoot = scoped ?? target;
    const identifiers = [identifierRoot, ...descendants(identifierRoot)].filter((child) =>
      ["Identifier", "FieldIdentifier", "NamespaceIdentifier", "TypeIdentifier", "OperatorName", "DestructorName"].includes(child.name),
    );
    const nameNode = identifiers.at(-1);
    if (!nameNode) continue;
    const symbol = makeSymbol(sourceText.slice(nameNode.from, nameNode.to), node);
    const lexicalParent = nearestAncestor(node, new Set([...typeKinds, "NamespaceDefinition"]));
    if (lexicalParent) {
      symbol.parent = nodes.get(nodeKey(lexicalParent));
    } else if (scoped) {
      const qualifier = identifiers.slice(0, -1).map((item) => sourceText.slice(item.from, item.to));
      symbol.parent = ensureContainerPath(qualifier, scoped, containers, symbols);
    }
    symbol.refinements.push(...collectLezerRefinements(node, sourceText, cppRefinementKey));
    symbols.push(symbol);
  }
  return { symbols };
}

export function parseRustDocument(sourceText: string): StructuralDocument {
  const root = rustParser.parse(sourceText).topNode;
  const symbols: StructuralSymbol[] = [];
  const types = new Map<string, StructuralSymbol>();
  const typeKinds = new Set(["StructItem", "EnumItem", "TraitItem", "UnionItem", "TypeItem"]);
  const moduleNodes = new Map<string, StructuralSymbol>();

  for (const node of descendants(root)) {
    if (node.name !== "ModItem") continue;
    const name = childText(node, "BoundIdentifier", sourceText);
    if (!name) continue;
    const symbol = makeSymbol(name, node);
    const parentNode = nearestAncestor(node, new Set(["ModItem"]));
    if (parentNode) symbol.parent = moduleNodes.get(nodeKey(parentNode));
    moduleNodes.set(nodeKey(node), symbol);
    symbols.push(symbol);
  }

  for (const node of descendants(root)) {
    if (!typeKinds.has(node.name)) continue;
    const nameNode = children(node).find((child) =>
      child.name === "TypeIdentifier" || child.name === "BoundIdentifier",
    );
    if (!nameNode) continue;
    const name = sourceText.slice(nameNode.from, nameNode.to);
    const symbol = makeSymbol(name, node);
    const moduleNode = nearestAncestor(node, new Set(["ModItem"]));
    if (moduleNode) symbol.parent = moduleNodes.get(nodeKey(moduleNode));
    symbols.push(symbol);
    types.set(rustTypeKey(symbol.parent, name), symbol);
  }

  for (const node of descendants(root)) {
    if (node.name !== "FunctionItem") continue;
    const name = childText(node, "BoundIdentifier", sourceText);
    if (!name) continue;
    const symbol = makeSymbol(name, node);
    const container = nearestAncestor(node, new Set(["ImplItem", "TraitItem", "FunctionItem"]));
    if (container?.name === "ImplItem") {
      const declarationListIndex = children(container).findIndex((child) => child.name === "DeclarationList");
      const header = children(container).slice(0, declarationListIndex < 0 ? undefined : declarationListIndex);
      const type = header.flatMap((child) => [child, ...descendants(child)])
        .filter((child) => child.name === "TypeIdentifier")
        .at(-1);
      if (type) {
        const typeName = sourceText.slice(type.from, type.to);
        const moduleNode = nearestAncestor(container, new Set(["ModItem"]));
        const module = moduleNode ? moduleNodes.get(nodeKey(moduleNode)) : undefined;
        const key = rustTypeKey(module, typeName);
        symbol.parent = types.get(key) ?? addVirtualType(types, symbols, typeName, type, key, module);
      }
    } else if (container?.name === "TraitItem") {
      const type = children(container).find((child) => child.name === "TypeIdentifier");
      if (type) {
        const typeName = sourceText.slice(type.from, type.to);
        const moduleNode = nearestAncestor(container, new Set(["ModItem"]));
        const module = moduleNode ? moduleNodes.get(nodeKey(moduleNode)) : undefined;
        symbol.parent = types.get(rustTypeKey(module, typeName));
      }
    } else if (container?.name === "FunctionItem") {
      symbol.parent = symbols.find((candidate) =>
        candidate.range.start === container.from && candidate.range.end === container.to,
      );
    }
    symbol.refinements.push(...collectLezerRefinements(node, sourceText, rustRefinementKey));
    symbols.push(symbol);
  }
  return { symbols };
}

function makeSymbol(name: string, node: SyntaxNode): StructuralSymbol {
  return { name, range: { start: node.from, end: node.to }, refinements: [] };
}

function addVirtualType(
  types: Map<string, StructuralSymbol>,
  symbols: StructuralSymbol[],
  name: string,
  node: SyntaxNode,
  key = name,
  parent?: StructuralSymbol,
): StructuralSymbol {
  const symbol = makeSymbol(name, node);
  symbol.parent = parent;
  types.set(key, symbol);
  symbols.push(symbol);
  return symbol;
}

function rustTypeKey(parent: StructuralSymbol | undefined, name: string): string {
  const segments: string[] = [name];
  for (let current = parent; current; current = current.parent) segments.unshift(current.name);
  return segments.join("::");
}

function collectLezerRefinements(
  symbolNode: SyntaxNode,
  sourceText: string,
  keyFor: (node: SyntaxNode, sourceText: string) => string | undefined,
): StructuralRefinement[] {
  const refinements: StructuralRefinement[] = [];
  const visit = (node: SyntaxNode): void => {
    for (const child of children(node)) {
      if (child !== symbolNode && isNamedDeclaration(child)) continue;
      const key = keyFor(child, sourceText);
      if (key) refinements.push({ key, range: { start: child.from, end: child.to } });
      visit(child);
    }
  };
  visit(symbolNode);
  return refinements;
}

function goRefinementKey(node: SyntaxNode, sourceText: string): string | undefined {
  if (node.name === "IfStatement") return "if";
  if (node.name === "ForStatement") return "for";
  if (node.name.includes("Switch") || node.name === "SelectStatement") return "switch";
  if (node.name === "ReturnStatement") return "return";
  if (node.name === "CallExpr") return callKey(node, sourceText, "Arguments");
  return undefined;
}

function javaRefinementKey(node: SyntaxNode, sourceText: string): string | undefined {
  if (node.name === "IfStatement") return "if";
  if (["ForStatement", "EnhancedForStatement", "WhileStatement", "DoStatement"].includes(node.name)) return "for";
  if (node.name === "SwitchStatement" || node.name === "SwitchExpression") return "switch";
  if (node.name === "ReturnStatement") return "return";
  if (node.name === "MethodInvocation") {
    const method = descendants(node).find((child) => child.name === "MethodName");
    const identifier = method
      ? [method, ...descendants(method)].find((child) => child.name === "Identifier")
      : undefined;
    const name = identifier ? sourceText.slice(identifier.from, identifier.to) : undefined;
    return name ? `call(${name})` : callKey(node, sourceText, "ArgumentList");
  }
  return undefined;
}

function cppRefinementKey(node: SyntaxNode, sourceText: string): string | undefined {
  if (node.name === "IfStatement") return "if";
  if (["ForStatement", "ForRangeStatement", "WhileStatement", "DoStatement"].includes(node.name)) return "for";
  if (node.name === "SwitchStatement") return "switch";
  if (node.name === "ReturnStatement") return "return";
  if (node.name === "CallExpression") return callKey(node, sourceText, "ArgumentList");
  return undefined;
}

function rustRefinementKey(node: SyntaxNode, sourceText: string): string | undefined {
  if (node.name === "IfExpression") return "if";
  if (node.name === "ForExpression" || node.name === "WhileExpression" || node.name === "LoopExpression") return "for";
  if (node.name === "MatchExpression") return "switch";
  if (node.name === "ReturnExpression") return "return";
  if (node.name === "CallExpression") return callKey(node, sourceText, "ArgList");
  return undefined;
}

function callKey(node: SyntaxNode, sourceText: string, argumentsNode: string): string | undefined {
  const expression = children(node).find((child) => child.name !== argumentsNode);
  if (!expression) return undefined;
  const names = descendants(expression).filter((child) =>
    child.name === "Identifier" ||
    child.name === "VariableName" ||
    child.name === "FieldName" ||
    child.name === "FieldIdentifier",
  );
  const selected = names.at(-1) ?? expression;
  const name = sourceText.slice(selected.from, selected.to).trim();
  return name ? `call(${name})` : undefined;
}

function isNamedDeclaration(node: SyntaxNode): boolean {
  return [
    "FunctionDecl",
    "MethodDecl",
    "FunctionItem",
    "TypeSpec",
    "StructItem",
    "EnumItem",
    "TraitItem",
    "ClassDeclaration",
    "InterfaceDeclaration",
    "EnumDeclaration",
    "RecordDeclaration",
    "MethodDeclaration",
    "ConstructorDeclaration",
    "ClassSpecifier",
    "StructSpecifier",
    "FunctionDefinition",
  ].includes(node.name);
}

function ensureContainerPath(
  names: readonly string[],
  rangeNode: SyntaxNode,
  containers: Map<string, StructuralSymbol>,
  symbols: StructuralSymbol[],
): StructuralSymbol | undefined {
  let parent: StructuralSymbol | undefined;
  let key = "";
  for (const name of names) {
    key = key ? `${key}::${name}` : name;
    let symbol = containers.get(key) ?? (!parent ? containers.get(name) : undefined);
    if (!symbol) {
      symbol = makeSymbol(name, rangeNode);
      symbol.parent = parent;
      containers.set(key, symbol);
      symbols.push(symbol);
    }
    parent = symbol;
  }
  return parent;
}

function childText(node: SyntaxNode, childName: string, sourceText: string): string | undefined {
  const child = children(node).find((candidate) => candidate.name === childName);
  return child ? sourceText.slice(child.from, child.to) : undefined;
}

function nodeKey(node: SyntaxNode): string {
  return `${node.from}:${node.to}:${node.name}`;
}

function nearestAncestor(node: SyntaxNode, names: ReadonlySet<string>): SyntaxNode | undefined {
  let current = node.parent;
  while (current) {
    if (names.has(current.name)) return current;
    current = current.parent;
  }
  return undefined;
}

function descendants(root: SyntaxNode): SyntaxNode[] {
  const nodes: SyntaxNode[] = [];
  const visit = (node: SyntaxNode): void => {
    for (const child of children(node)) {
      nodes.push(child);
      visit(child);
    }
  };
  visit(root);
  return nodes;
}

function children(node: SyntaxNode): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) result.push(child);
  return result;
}
