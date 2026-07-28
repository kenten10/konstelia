import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DefaultSemanticAnchorAdapter } from "../src/infrastructure/language/DefaultSemanticAnchorAdapter";

describe("multi-language semantic anchors", () => {
  const adapter = new DefaultSemanticAnchorAdapter();

  it("generates and resolves JavaScript method refinements", () => {
    assertRoundTrip(
      adapter,
      "auth.js",
      `export class AuthService {
  login(user) {
    return verify(user);
  }
}
`,
      "verify(user)",
      "AuthService.login",
      "call(verify)[0]",
    );
  });

  it("generates and resolves Go receiver method refinements", () => {
    assertRoundTrip(
      adapter,
      "service.go",
      `package sample

type OrderService struct{}

func (service *OrderService) Create(order Order) error {
  repository.Save(order)
  return nil
}
`,
      "repository.Save(order)",
      "OrderService.Create",
      "call(Save)[0]",
    );
  });

  it("generates and resolves Rust impl method refinements", () => {
    assertRoundTrip(
      adapter,
      "service.rs",
      `struct OrderService {}

impl OrderService {
    fn create(&self, order: Order) -> Result<(), Error> {
        repository::save(order);
        Ok(())
    }
}
`,
      "repository::save(order)",
      "OrderService.create",
      "call(save)[0]",
    );
  });

  it("generates and resolves Ruby class method refinements", () => {
    assertRoundTrip(
      adapter,
      "order_service.rb",
      `class OrderService
  def create(order)
    repository.save(order)
    return order
  end
end
`,
      "repository.save(order)",
      "OrderService.create",
      "call(save)[0]",
    );
  });

  it("generates and resolves Swift type method refinements", () => {
    assertRoundTrip(
      adapter,
      "OrderService.swift",
      `final class OrderService {
    func create(order: Order) throws -> Order {
        try repository.save(order)
        return order
    }
}
`,
      "repository.save(order)",
      "OrderService.create",
      "call(save)[0]",
    );
  });

  it("reports unsupported extensions without falling through to another parser", () => {
    const result = adapter.resolve("<?php function main() {}", "main.php", "main");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /No semantic anchor adapter/);
  });

  it("keeps receiver and extension types in paths when their declaration is in another file", () => {
    const cases = [
      { file: "external.go", source: "package sample\nfunc (value *External) Run() { work() }", expected: "External.Run" },
      { file: "external.rs", source: "impl External { fn run(&self) { work(); } }", expected: "External.run" },
      { file: "External.swift", source: "extension External { func run() { work() } }", expected: "External.run" },
    ];
    for (const item of cases) {
      const start = item.source.indexOf("work()");
      const generated = adapter.generate(item.source, item.file, start, start + "work()".length);
      assert.equal(generated.ok, true, generated.ok ? undefined : generated.reason);
      if (generated.ok) assert.equal(generated.target.symbol, item.expected);
    }
  });

  it("includes Rust modules and Ruby qualified classes in symbol paths", () => {
    const rust = "mod billing { struct Service; impl Service { fn run(&self) { work(); } } }";
    const rustStart = rust.indexOf("work()");
    const rustResult = adapter.generate(rust, "service.rs", rustStart, rustStart + 6);
    assert.equal(rustResult.ok, true);
    if (rustResult.ok) assert.equal(rustResult.target.symbol, "billing.Service.run");

    const ruby = "class Billing::Service\n  def run\n    work()\n  end\nend\n";
    const rubyStart = ruby.indexOf("work()");
    const rubyResult = adapter.generate(ruby, "service.rb", rubyStart, rubyStart + 6);
    assert.equal(rubyResult.ok, true);
    if (rubyResult.ok) assert.equal(rubyResult.target.symbol, "Billing.Service.run");
  });
});

function assertRoundTrip(
  adapter: DefaultSemanticAnchorAdapter,
  fileName: string,
  sourceText: string,
  selection: string,
  expectedSymbol: string,
  expectedRefinement: string,
): void {
  const start = sourceText.indexOf(selection);
  assert.notEqual(start, -1);
  const generated = adapter.generate(sourceText, fileName, start, start + selection.length);
  assert.equal(generated.ok, true, generated.ok ? undefined : generated.reason);
  if (!generated.ok) return;
  assert.equal(generated.target.symbol, expectedSymbol);
  assert.equal(generated.target.refinement, expectedRefinement);
  assert.deepEqual(
    adapter.resolve(sourceText, fileName, generated.target.symbol, generated.target.refinement),
    { ok: true, range: generated.target.range },
  );
}
