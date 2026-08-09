import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const sourceRoot = path.join(process.cwd(), "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(path.join(sourceRoot, directory), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function importsOf(file: string): string[] {
  return [...readFileSync(file, "utf8").matchAll(/from "([^"]+)"/g)]
    .map((match) => match[1] ?? "")
    .filter((specifier) => specifier.length > 0);
}

function resolved(file: string, specifier: string): string {
  return specifier.startsWith(".")
    ? path.relative(sourceRoot, path.resolve(path.dirname(file), specifier))
    : specifier;
}

describe("layering", () => {
  it("keeps the domain free of every other layer", () => {
    for (const file of sourceFiles("domain")) {
      for (const specifier of importsOf(file)) {
        assert.ok(
          specifier.startsWith("."),
          `${path.basename(file)} imports the package '${specifier}'.`,
        );
        assert.ok(
          resolved(file, specifier).startsWith("domain"),
          `${path.basename(file)} imports '${specifier}' from outside the domain.`,
        );
      }
    }
  });

  it("points the application at the domain only", () => {
    // Storage and playback are ports declared in `application`; `infrastructure` implements
    // them. An import in this direction would turn the dependency around.
    for (const file of sourceFiles("application")) {
      for (const specifier of importsOf(file)) {
        const target = resolved(file, specifier);
        assert.ok(
          !target.startsWith("infrastructure") && !target.startsWith("presentation"),
          `${path.basename(file)} imports '${specifier}'.`,
        );
        assert.notEqual(specifier, "vscode", `${path.basename(file)} imports the vscode API.`);
      }
    }
  });

  it("keeps the vscode API out of the domain and the application", () => {
    for (const directory of ["domain", "application"]) {
      for (const file of sourceFiles(directory)) {
        assert.ok(
          !readFileSync(file, "utf8").includes('from "vscode"'),
          `${directory}/${path.basename(file)} imports the vscode API.`,
        );
      }
    }
  });

  it("keeps the flow diagram layout and markup usable without vscode", () => {
    // These render the diagram and the editing screen, and are unit tested directly.
    for (const file of [
      "presentation/flow/TourFlowLayout.ts",
      "presentation/flow/TourFlowSvg.ts",
      "presentation/editor/TourEditorHtml.ts",
      "presentation/editor/TourEditorState.ts",
    ]) {
      assert.ok(
        !readFileSync(path.join(sourceRoot, file), "utf8").includes('from "vscode"'),
        `${file} imports the vscode API.`,
      );
    }
  });
});
