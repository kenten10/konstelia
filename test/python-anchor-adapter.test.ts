import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DefaultSemanticAnchorAdapter } from "../src/infrastructure/language/DefaultSemanticAnchorAdapter";
import { PythonAnchorAdapter } from "../src/infrastructure/language/PythonAnchorAdapter";

const source = `
class OrderService:
    def create_order(self, product_id):
        product = self.catalog.find_by_id(product_id)
        if product is None:
            return None
        for candidate in [product]:
            self.payments.charge(candidate.price)
        return product
`;

describe("PythonAnchorAdapter", () => {
  const adapter = new PythonAnchorAdapter();

  it("resolves classes, methods, and structural refinements", () => {
    for (const refinement of [
      undefined,
      "call(find_by_id)[0]",
      "if[0]",
      "for[0]",
      "call(charge)[0]",
      "return[1]",
    ]) {
      const result = adapter.resolve(source, "order_service.py", "OrderService.create_order", refinement);
      assert.equal(result.ok, true, refinement);
    }
  });

  it("generates a round-trip symbol path from a Python selection", () => {
    const selected = "self.catalog.find_by_id(product_id)";
    const start = source.indexOf(selected);

    const generated = adapter.generate(source, "order_service.py", start, start + selected.length);

    assert.equal(generated.ok, true);
    if (!generated.ok) return;
    assert.equal(generated.target.symbol, "OrderService.create_order");
    assert.equal(generated.target.refinement, "call(find_by_id)[0]");
    assert.equal(
      adapter.resolve(
        source,
        "order_service.py",
        generated.target.symbol,
        generated.target.refinement,
      ).ok,
      true,
    );
  });

  it("routes Python and TypeScript files through the default adapter", () => {
    const router = new DefaultSemanticAnchorAdapter();

    assert.equal(router.resolve(source, "order_service.py", "OrderService.create_order").ok, true);
    assert.equal(
      router.resolve("export function run() {}", "run.ts", "run").ok,
      true,
    );
    const unsupported = router.resolve("<?php function main() {}", "main.php", "main");
    assert.equal(unsupported.ok, false);
    if (!unsupported.ok) assert.match(unsupported.reason, /No semantic anchor adapter/);
  });
});
