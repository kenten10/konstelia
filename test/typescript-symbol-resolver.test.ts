import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveTypeScriptSymbol } from "../src/infrastructure/language/TypeScriptSymbolResolver";

const source = `
export class AuthController {
  private attempts = 0;

  async login(): Promise<void> {
    return;
  }
}
`;

describe("resolveTypeScriptSymbol", () => {
  it("resolves a class method without a VS Code symbol provider", () => {
    const range = resolveTypeScriptSymbol(source, "authController.ts", "AuthController.login");

    assert.ok(range);
    assert.match(source.slice(range.start, range.end), /^async login\(\)/);
  });

  it("resolves a class property", () => {
    const range = resolveTypeScriptSymbol(source, "authController.ts", "AuthController.attempts");

    assert.ok(range);
    assert.match(source.slice(range.start, range.end), /^private attempts = 0/);
  });

  it("returns undefined for an unknown path", () => {
    assert.equal(
      resolveTypeScriptSymbol(source, "authController.ts", "AuthController.unknown"),
      undefined,
    );
  });
});
