import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAnchorSnapshot } from "../src/application/anchors/AnchorSnapshot";
import { ResolveAnchor } from "../src/application/anchors/ResolveAnchor";
import { AnchorHealth, type TourAnchor } from "../src/domain/tour/TourAnchor";
import { TypeScriptAnchorAdapter } from "../src/infrastructure/language/TypeScriptAnchorAdapter";

const source = "export function active() { return true; }\n";

describe("ResolveAnchor", () => {
  const resolver = new ResolveAnchor(new TypeScriptAnchorAdapter());

  it("reports healthy when symbol and refinement resolve", () => {
    const result = resolver.execute({ id: "active", file: "a.ts", symbol: "active" }, source);
    assert.equal(result.health, AnchorHealth.Healthy);
    assert.ok(result.range);
  });

  it("reports drifted with the symbol fallback when a refinement fails", () => {
    const result = resolver.execute(
      { id: "active", file: "a.ts", symbol: "active", refinement: "if[0]" },
      source,
    );
    assert.equal(result.health, AnchorHealth.Drifted);
    assert.ok(result.range);
  });

  it("follows one snapshot candidate when the symbol path breaks", () => {
    const original = "export function renamed() { return true; }";
    const anchor: TourAnchor = {
      id: "old",
      file: "a.ts",
      symbol: "oldName",
      snapshot: createAnchorSnapshot(original),
    };
    const result = resolver.execute(anchor, `${original}\n`);

    assert.equal(result.health, AnchorHealth.Drifted);
    assert.ok(result.range);
  });

  it("reports broken when neither path nor snapshot resolves uniquely", () => {
    const result = resolver.execute(
      { id: "missing", file: "a.ts", symbol: "missing" },
      source,
    );
    assert.equal(result.health, AnchorHealth.Broken);
    assert.equal(result.range, undefined);
  });

  it("stays healthy when the anchored code itself is edited", () => {
    const original = "export function greet() { return \"hi\"; }";
    const anchor: TourAnchor = {
      id: "greet",
      file: "a.ts",
      symbol: "greet",
      snapshot: createAnchorSnapshot(original),
    };

    const result = resolver.execute(anchor, "export function greet() { return \"hello\"; }\n");

    // The saved text exists nowhere else, so the symbol still points at what the author chose.
    assert.equal(result.health, AnchorHealth.Healthy);
    assert.ok(result.range);
  });

  it("does not report healthy when an ordinal shifts to another declaration", () => {
    const original = "export function parse(value: string): string;\nexport function parse(value: unknown) { return String(value); }";
    const implementation = "export function parse(value: unknown) { return String(value); }";
    const anchor: TourAnchor = {
      id: "parse",
      file: "a.ts",
      symbol: "parse#1",
      snapshot: createAnchorSnapshot(implementation),
    };
    const changed = `export function parse(value: number): number;\n${original}`;

    const result = resolver.execute(anchor, changed);

    assert.equal(result.health, AnchorHealth.Drifted);
    assert.equal(changed.slice(result.range?.start, result.range?.end), implementation);
  });
});
