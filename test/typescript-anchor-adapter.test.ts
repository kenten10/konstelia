import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TypeScriptAnchorAdapter } from "../src/infrastructure/language/TypeScriptAnchorAdapter";

const source = `
export class AuthService {
  async authenticate(email: string) {
    if (!email) return false;
    return verify(email);
  }
}

export function parse(x: string): number;
export function parse(x: unknown): number { return 1; }

export function setup(router: Router) {
  router.get("/", async () => {
    if (!ready()) return;
  });
}
`;

describe("TypeScriptAnchorAdapter", () => {
  const adapter = new TypeScriptAnchorAdapter();

  it("generates and resolves structural refinements", () => {
    for (const selectedText of ["if (!email) return false;", "verify(email)"]) {
      const start = source.indexOf(selectedText);
      const generated = adapter.generate(source, "sample.ts", start, start + selectedText.length);

      assert.equal(generated.ok, true);
      if (!generated.ok) return;
      assert.equal(generated.target.symbol, "AuthService.authenticate");
      assert.ok(generated.target.refinement);
      const resolved = adapter.resolve(
        source,
        "sample.ts",
        generated.target.symbol,
        generated.target.refinement,
      );
      assert.deepEqual(resolved, { ok: true, range: generated.target.range });
    }
  });

  it("uses ordinals for overloaded declarations", () => {
    const selectedText = "export function parse(x: string): number";
    const start = source.indexOf(selectedText);
    const generated = adapter.generate(source, "sample.ts", start, start + selectedText.length);

    assert.equal(generated.ok, true);
    if (!generated.ok) return;
    assert.equal(generated.target.symbol, "parse#0");
    assert.equal(adapter.resolve(source, "sample.ts", generated.target.symbol).ok, true);
  });

  it("anchors anonymous callback contents through the nearest named parent", () => {
    const selectedText = "if (!ready()) return;";
    const start = source.indexOf(selectedText);
    const generated = adapter.generate(source, "sample.ts", start, start + selectedText.length);

    assert.equal(generated.ok, true);
    if (!generated.ok) return;
    assert.equal(generated.target.symbol, "setup");
    assert.equal(generated.target.refinement, "if[0]");
  });

  it("returns the named symbol as a fallback when a refinement drifts", () => {
    const result = adapter.resolve(source, "sample.ts", "AuthService.authenticate", "if[9]");

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.fallbackRange);
  });

  it("resolves an unnumbered return only when it is unique", () => {
    const uniqueSource = "export function one() { return 1; }";
    const unique = adapter.resolve(uniqueSource, "sample.ts", "one", "return");

    assert.equal(unique.ok, true);

    const ambiguous = adapter.resolve(source, "sample.ts", "AuthService.authenticate", "return");
    assert.equal(ambiguous.ok, false);
    if (ambiguous.ok) return;
    assert.match(ambiguous.reason, /ambiguous \(2 return statements\)/);
    assert.ok(ambiguous.fallbackRange);
  });

  it("rejects malformed symbol-path and excluded refinements", () => {
    assert.match(
      getFailureReason(adapter.resolve(source, "sample.ts", "AuthService..authenticate")),
      /Invalid TypeScript symbol segment/,
    );
    assert.match(
      getFailureReason(adapter.resolve(source, "sample.ts", "AuthService.authenticate", "lines(2..4)")),
      /Invalid TypeScript refinement/,
    );
  });

  it("does not make an object literal inside a function a path segment", () => {
    const local = `export function build() {
  const config = { retry: () => { return 42; } };
  return config;
}
`;
    const selection = "return 42;";
    const start = local.indexOf(selection);

    const generated = adapter.generate(local, "build.ts", start, start + selection.length);

    // Specification §4.4: only module, namespace, and class scoped declarations may be segments.
    assert.equal(generated.ok, true, generated.ok ? undefined : generated.reason);
    if (!generated.ok) return;
    assert.equal(generated.target.symbol, "build");
  });

  it("keeps module-scoped object literal members addressable", () => {
    const moduleScoped = `export const api = {
  get() { return 1; },
};
`;
    const selection = "return 1;";
    const start = moduleScoped.indexOf(selection);

    const generated = adapter.generate(moduleScoped, "api.ts", start, start + selection.length);

    assert.equal(generated.ok, true, generated.ok ? undefined : generated.reason);
    if (!generated.ok) return;
    assert.equal(generated.target.symbol, "api.get");
  });

  it("ranks exact and structurally similar snapshot candidates", () => {
    const snapshot = "export function login(email: string) { return verify(email); }";
    const current = `
      export function unrelated() { return false; }
      export function signIn(email: string) { return verify(email); }
      export function login(email: string) { return verify(email); }
    `;

    const candidates = adapter.findSimilarSnapshotCandidates(current, "auth.ts", snapshot);

    assert.equal(candidates[0]?.target.symbol, "login");
    assert.equal(candidates[0]?.similarity, 1);
    const renamed = candidates.find((candidate) => candidate.target.symbol === "signIn");
    assert.ok(renamed);
    assert.ok(renamed.similarity > 0.8);
  });
});

function getFailureReason(result: ReturnType<TypeScriptAnchorAdapter["resolve"]>): string {
  assert.equal(result.ok, false);
  return result.ok ? "" : result.reason;
}
