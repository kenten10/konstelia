import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAnchorReference } from "../src/domain/tour/AnchorReference";
import {
  formatTypeScriptRefinement,
  formatTypeScriptSymbolPath,
  parseTypeScriptRefinement,
  parseTypeScriptSymbolPath,
} from "../src/infrastructure/language/TypeScriptSymbolPath";

describe("TypeScript symbol-path syntax", () => {
  it("parses and formats named paths, accessors, and declaration ordinals", () => {
    const path = parseTypeScriptSymbolPath("AuthService.locked[get]#1");

    assert.deepEqual(path, {
      segments: [
        { name: "AuthService", ordinal: undefined },
        { name: "locked[get]", ordinal: 1 },
      ],
    });
    assert.equal(formatTypeScriptSymbolPath(path), "AuthService.locked[get]#1");
  });

  it("rejects canonical and refinement delimiters inside a symbol-path", () => {
    for (const value of ["", "Auth..login", "src/a.ts::Auth.login", "Auth.login@if[0]"]) {
      assert.throws(() => parseTypeScriptSymbolPath(value), /Invalid TypeScript/);
    }
  });

  it("supports only the v0 structural refinements", () => {
    assert.deepEqual(parseTypeScriptRefinement("return"), {
      kind: "return",
      ordinal: undefined,
    });
    assert.deepEqual(parseTypeScriptRefinement("call(verify)[2]"), {
      kind: "call",
      name: "verify",
      ordinal: 2,
    });
    assert.equal(
      formatTypeScriptRefinement({ kind: "switch", ordinal: 0 }),
      "switch[0]",
    );
    for (const value of ["lines(2..4)", "if", "call(verify)", "return[-1]"]) {
      assert.throws(() => parseTypeScriptRefinement(value), /Invalid TypeScript refinement/);
    }
    assert.throws(
      () => formatTypeScriptRefinement({ kind: "call", name: "", ordinal: 0 }),
      /Invalid call refinement name/,
    );
  });

  it("formats the specification canonical reference without changing registry fields", () => {
    assert.equal(
      formatAnchorReference({
        file: "src/auth/service.ts",
        symbol: "AuthService.authenticate",
        refinement: "if[0]",
      }),
      "src/auth/service.ts::AuthService.authenticate@if[0]",
    );
  });
});
