import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DefaultSemanticAnchorAdapter } from "../src/infrastructure/language/DefaultSemanticAnchorAdapter";

describe("text-scanned language edge cases", () => {
  const adapter = new DefaultSemanticAnchorAdapter();

  function generateAt(fileName: string, sourceText: string, selection: string) {
    const start = sourceText.indexOf(selection);
    assert.notEqual(start, -1, `Selection not found: ${selection}`);
    return adapter.generate(sourceText, fileName, start, start + selection.length);
  }

  it("keeps scanning C# after a verbatim string that ends with a backslash", () => {
    const source = `public class Paths {
  private string root = @"C:\\temp\\";
  public string Go() {
    return root;
  }
}
`;
    const generated = generateAt("Paths.cs", source, "return root;");

    // A verbatim string does not use backslash escapes; treating it as one used to swallow
    // the rest of the file, leaving every later member invisible.
    assert.equal(generated.ok, true, generated.ok ? undefined : generated.reason);
    if (!generated.ok) return;
    assert.equal(generated.target.symbol, "Paths.Go");
  });

  it("does not turn a C# else-if into a member named 'if'", () => {
    const source = `public class Svc {
  public int Run(int x) {
    if (x > 0) {
      return 1;
    } else if (x < -10) {
      return -1;
    }
    return 0;
  }
}
`;
    const generated = generateAt("Svc.cs", source, "return -1;");

    assert.equal(generated.ok, true, generated.ok ? undefined : generated.reason);
    if (!generated.ok) return;
    assert.equal(generated.target.symbol, "Svc.Run");
    assert.match(generated.target.refinement ?? "", /^(if|return)\[\d+\]$/);
  });

  it("does not treat a C# method declaration as a call to itself", () => {
    const source = `public class Math2 {
  public int Fact(int n) {
    if (n <= 1) { return 1; }
    return n * Fact(n - 1);
  }
}
`;
    const resolved = adapter.resolve(source, "Math2.cs", "Math2.Fact", "call(Fact)[0]");

    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    // Ordinal 0 must be the recursive call, not the signature.
    assert.equal(source.slice(resolved.range.start, resolved.range.end), "Fact(n - 1)");
  });

  it("ignores an 'end' that appears inside a Ruby heredoc", () => {
    const source = `class Q
  def sql
    <<~SQL
      select 1
      end
    SQL
  end

  def other
    2
  end
end
`;
    const generated = generateAt("q.rb", source, "2");

    assert.equal(generated.ok, true, generated.ok ? undefined : generated.reason);
    if (!generated.ok) return;
    assert.equal(generated.target.symbol, "Q.other");
  });

  it("keeps methods inside the class after a singleton class body", () => {
    const source = `class C
  class << self
    def build
      new
    end
  end

  def run
    1
  end
end
`;
    const generated = generateAt("c.rb", source, "1");

    assert.equal(generated.ok, true, generated.ok ? undefined : generated.reason);
    if (!generated.ok) return;
    assert.equal(generated.target.symbol, "C.run");
  });

  it("closes a single-line Ruby definition on its own line", () => {
    const source = `class A
  def a; 1; end

  def b
    2
  end
end
`;
    const generated = generateAt("a.rb", source, "2");

    assert.equal(generated.ok, true, generated.ok ? undefined : generated.reason);
    if (!generated.ok) return;
    assert.equal(generated.target.symbol, "A.b");
  });

  it("snaps a selection inside a C# local function to the enclosing method", () => {
    const source = `public class Outer {
  public int Run(int n) {
    int Helper(int v) {
      if (v > 0) { return v; }
      return 0;
    }
    if (n > 0) { return Helper(n); }
    return 0;
  }
}
`;
    const generated = generateAt("Outer.cs", source, "return v;");

    assert.equal(generated.ok, true, generated.ok ? undefined : generated.reason);
    if (!generated.ok) return;
    // Specification §4.4: a local function is too volatile to be a path segment.
    assert.equal(generated.target.symbol, "Outer.Run");
  });

  it("does not let a nested function shift the ordinals of its parent", () => {
    const source = `public class Outer {
  public int Run(int n) {
    int Helper(int v) {
      if (v > 0) { return v; }
      return 0;
    }
    if (n > 0) { return Helper(n); }
    return 0;
  }
}
`;
    const resolved = adapter.resolve(source, "Outer.cs", "Outer.Run", "if[0]");

    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    assert.match(source.slice(resolved.range.start, resolved.range.end), /^if \(n > 0\)/);
  });
});

describe("member and refinement coverage", () => {
  const adapter = new DefaultSemanticAnchorAdapter();

  function roundTrip(fileName: string, source: string, selection: string) {
    const start = source.indexOf(selection);
    assert.notEqual(start, -1, `Selection not found: ${selection}`);
    const generated = adapter.generate(source, fileName, start, start + selection.length);
    assert.equal(generated.ok, true, generated.ok ? undefined : generated.reason);
    if (!generated.ok) return undefined;
    assert.deepEqual(
      adapter.resolve(source, fileName, generated.target.symbol, generated.target.refinement),
      { ok: true, range: generated.target.range },
    );
    return generated.target;
  }

  it("addresses Swift initializers, deinitializers, and subscripts", () => {
    const source = `struct Store {
  init(values: [Int]) { self.values = values }
  subscript(index: Int) -> Int { return values[index] }
}

class Session {
  deinit { close() }
}
`;
    assert.equal(roundTrip("Store.swift", source, "self.values = values")?.symbol, "Store.init");
    assert.equal(roundTrip("Store.swift", source, "return values[index]")?.symbol, "Store.subscript");
    assert.equal(roundTrip("Store.swift", source, "close()")?.symbol, "Session.deinit");
  });

  it("treats every loop as a for refinement", () => {
    const typescript = `export function drain(items: string[]) {
  while (items.length) {
    items.pop();
  }
}
`;
    const python = `def drain(items):
    while items:
        items.pop()
`;
    assert.equal(
      roundTrip("drain.ts", typescript, "while (items.length) {\n    items.pop();\n  }")?.refinement,
      "for[0]",
    );
    assert.equal(
      roundTrip("drain.py", python, "while items:\n        items.pop()")?.refinement,
      "for[0]",
    );
  });

  it("treats a Python match as a switch refinement", () => {
    const source = `def classify(value):
    match value:
        case 1:
            return "one"
`;

    assert.equal(
      roundTrip("classify.py", source, 'match value:\n        case 1:\n            return "one"')?.refinement,
      "switch[0]",
    );
  });
});
