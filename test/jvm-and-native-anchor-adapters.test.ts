import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DefaultSemanticAnchorAdapter } from "../src/infrastructure/language/DefaultSemanticAnchorAdapter";

describe("JVM and native semantic anchors", () => {
  const adapter = new DefaultSemanticAnchorAdapter();

  it("generates and resolves Java method refinements", () => {
    assertRoundTrip(
      "OrderService.java",
      `class OrderService {
  Order create(Order order) {
    repository.save(order);
    return order;
  }
}
`,
      "repository.save(order)",
      "OrderService.create",
      "call(save)[0]",
    );
  });

  it("generates and resolves C# method refinements", () => {
    assertRoundTrip(
      "OrderService.cs",
      `public class OrderService {
  public Order Create(Order order) {
    repository.Save(order);
    return order;
  }
}
`,
      "repository.Save(order)",
      "OrderService.Create",
      "call(Save)[0]",
    );
  });

  it("recognizes C# types whose opening brace is on the next line", () => {
    assertRoundTrip(
      "AllmanService.cs",
      `public class AllmanService
{
  public void Run()
  {
    worker.Execute();
  }
}
`,
      "worker.Execute()",
      "AllmanService.Run",
      "call(Execute)[0]",
    );
  });

  it("generates and resolves C function refinements", () => {
    assertRoundTrip(
      "order_service.c",
      `int create_order(int order) {
  save_order(order);
  return order;
}
`,
      "save_order(order)",
      "create_order",
      "call(save_order)[0]",
    );
  });

  it("supports pointer-returning C functions", () => {
    assertRoundTrip(
      "lookup.c",
      `Order *find_order(int id) {
  return repository_find(id);
}
`,
      "repository_find(id)",
      "find_order",
      "call(repository_find)[0]",
    );
  });

  it("generates and resolves C++ class method refinements", () => {
    assertRoundTrip(
      "order_service.cpp",
      `class OrderService {
public:
  Order create(Order order) {
    repository.save(order);
    return order;
  }
};
`,
      "repository.save(order)",
      "OrderService.create",
      "call(save)[0]",
    );
  });

  it("generates and resolves Kotlin function refinements", () => {
    assertRoundTrip(
      "OrderService.kt",
      `class OrderService {
  fun create(order: Order): Order {
    repository.save(order)
    return order
  }
}
`,
      "repository.save(order)",
      "OrderService.create",
      "call(save)[0]",
    );
  });

  function assertRoundTrip(
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
});
