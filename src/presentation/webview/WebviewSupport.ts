import { randomBytes } from "node:crypto";

/**
 * A nonce is the last line of defence if markup generation ever leaks unescaped input,
 * so it must not be predictable. `Math.random` is not a cryptographic source.
 */
export function createNonce(): string {
  return randomBytes(16).toString("base64");
}
