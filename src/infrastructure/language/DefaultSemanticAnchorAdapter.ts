import type {
  AnchorOffsetRange,
  GenerateSemanticAnchorResult,
  ResolveSemanticAnchorResult,
  SemanticAnchorAdapter,
  SimilarSemanticAnchor,
} from "../../application/anchors/SemanticAnchorAdapter";
import { CppAnchorAdapter } from "./CppAnchorAdapter";
import { CSharpAnchorAdapter } from "./CSharpAnchorAdapter";
import { GoAnchorAdapter } from "./GoAnchorAdapter";
import { JavaAnchorAdapter } from "./JavaAnchorAdapter";
import { KotlinAnchorAdapter } from "./KotlinAnchorAdapter";
import { PythonAnchorAdapter } from "./PythonAnchorAdapter";
import { RubyAnchorAdapter } from "./RubyAnchorAdapter";
import { RustAnchorAdapter } from "./RustAnchorAdapter";
import { SwiftAnchorAdapter } from "./SwiftAnchorAdapter";
import { TypeScriptAnchorAdapter } from "./TypeScriptAnchorAdapter";

export class DefaultSemanticAnchorAdapter implements SemanticAnchorAdapter {
  public constructor(
    private readonly typeScript = new TypeScriptAnchorAdapter(),
    private readonly python = new PythonAnchorAdapter(),
    private readonly ruby = new RubyAnchorAdapter(),
    private readonly rust = new RustAnchorAdapter(),
    private readonly go = new GoAnchorAdapter(),
    private readonly swift = new SwiftAnchorAdapter(),
    private readonly java = new JavaAnchorAdapter(),
    private readonly cSharp = new CSharpAnchorAdapter(),
    private readonly c = new CppAnchorAdapter("C"),
    private readonly cpp = new CppAnchorAdapter("C++"),
    private readonly kotlin = new KotlinAnchorAdapter(),
  ) {}

  public generate(
    sourceText: string,
    fileName: string,
    start: number,
    end: number,
  ): GenerateSemanticAnchorResult {
    const adapter = this.adapterFor(fileName);
    return adapter
      ? adapter.generate(sourceText, fileName, start, end)
      : { ok: false, reason: unsupportedLanguage(fileName) };
  }

  public resolve(
    sourceText: string,
    fileName: string,
    symbolPath: string,
    refinement?: string | null,
  ): ResolveSemanticAnchorResult {
    const adapter = this.adapterFor(fileName);
    return adapter
      ? adapter.resolve(sourceText, fileName, symbolPath, refinement)
      : { ok: false, reason: unsupportedLanguage(fileName) };
  }

  public findSnapshotCandidates(
    sourceText: string,
    fileName: string,
    snapshotText: string,
  ): AnchorOffsetRange[] {
    return this.adapterFor(fileName)?.findSnapshotCandidates(sourceText, fileName, snapshotText) ?? [];
  }

  public findSimilarSnapshotCandidates(
    sourceText: string,
    fileName: string,
    snapshotText: string,
  ): SimilarSemanticAnchor[] {
    return this.adapterFor(fileName)?.findSimilarSnapshotCandidates(
      sourceText,
      fileName,
      snapshotText,
    ) ?? [];
  }

  private adapterFor(fileName: string): SemanticAnchorAdapter | undefined {
    const normalized = fileName.toLowerCase();
    if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].some((extension) => normalized.endsWith(extension))) {
      return this.typeScript;
    }
    if (normalized.endsWith(".py")) return this.python;
    if (normalized.endsWith(".rb")) return this.ruby;
    if (normalized.endsWith(".rs")) return this.rust;
    if (normalized.endsWith(".go")) return this.go;
    if (normalized.endsWith(".swift")) return this.swift;
    if (normalized.endsWith(".java")) return this.java;
    if (normalized.endsWith(".cs")) return this.cSharp;
    if (normalized.endsWith(".c")) return this.c;
    if ([".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx"].some((extension) => normalized.endsWith(extension))) {
      return this.cpp;
    }
    if (normalized.endsWith(".kt") || normalized.endsWith(".kts")) return this.kotlin;
    return undefined;
  }
}

function unsupportedLanguage(fileName: string): string {
  return `No semantic anchor adapter is registered for '${fileName}'.`;
}
