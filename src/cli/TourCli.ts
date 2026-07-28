import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { assertSafeTourSourcePath } from "../domain/tour/TourSourcePath";
import { ValidateTourProject, type TourProjectFile } from "../application/tours/ValidateTourProject";
import { AnchorHealth, type TourAnchor } from "../domain/tour/TourAnchor";
import { DefaultSemanticAnchorAdapter } from "../infrastructure/language/DefaultSemanticAnchorAdapter";
import { deserializeAnchors } from "../infrastructure/storage/AnchorYaml";
import {
  deserializeTour,
  TourDocumentValidationError,
} from "../infrastructure/storage/TourYaml";

export interface TourCliOutput {
  write(message: string): void;
  writeError(message: string): void;
}

interface CliOptions {
  readonly format: "human" | "json";
  readonly root: string;
}

export async function runTourCli(
  args: readonly string[],
  currentDirectory: string,
  output: TourCliOutput,
): Promise<number> {
  let options: CliOptions;
  try {
    options = parseOptions(args, currentDirectory);
  } catch (error) {
    output.writeError(error instanceof Error ? error.message : "Invalid arguments.");
    output.writeError("Usage: tour validate [--format json] [--root PATH]");
    return 2;
  }

  const project = await loadProject(options.root);
  const report = await new ValidateTourProject(new DefaultSemanticAnchorAdapter()).execute(project);
  output.write(options.format === "json" ? JSON.stringify(report, null, 2) : formatHumanReport(report));
  return report.health === AnchorHealth.Broken ? 1 : 0;
}

function parseOptions(args: readonly string[], currentDirectory: string): CliOptions {
  if (args[0] !== "validate") {
    throw new Error("The only supported command is 'validate'.");
  }
  let format: CliOptions["format"] = "human";
  let root = currentDirectory;
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === "--format" && value === "json") {
      format = "json";
      index += 1;
    } else if (argument === "--root" && value) {
      root = path.resolve(currentDirectory, value);
      index += 1;
    } else {
      throw new Error(`Unknown argument '${argument ?? ""}'.`);
    }
  }
  return { format, root: path.resolve(root) };
}

async function loadProject(root: string): Promise<Parameters<ValidateTourProject["execute"]>[0]> {
  const metadataRoot = path.join(root, ".konstelia");
  const projectIssues: { file: string; message: string }[] = [];
  const tours = await loadTours(metadataRoot, projectIssues);
  const anchors = await loadAnchors(metadataRoot, projectIssues);
  return {
    root,
    tours,
    anchors,
    projectIssues,
    readSource: (relativeFile) => readProjectSource(root, relativeFile),
  };
}

async function loadTours(
  metadataRoot: string,
  projectIssues: { file: string; message: string }[],
): Promise<TourProjectFile[]> {
  const directory = path.join(metadataRoot, "tours");
  let names: string[];
  try {
    names = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".tour.yaml"))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    projectIssues.push({ file: relativeMetadataFile(metadataRoot, directory), message: errorMessage(error) });
    return [];
  }
  return Promise.all(names.map(async (name): Promise<TourProjectFile> => {
    const absoluteFile = path.join(directory, name);
    const file = relativeMetadataFile(metadataRoot, absoluteFile);
    try {
      return { file, tour: deserializeTour(await readFile(absoluteFile)), issues: [] };
    } catch (error) {
      const issues = error instanceof TourDocumentValidationError
        ? error.issues
        : [{ path: "$", message: errorMessage(error) }];
      return { file, issues };
    }
  }));
}

async function loadAnchors(
  metadataRoot: string,
  projectIssues: { file: string; message: string }[],
): Promise<TourAnchor[]> {
  const absoluteFile = path.join(metadataRoot, "anchors.yaml");
  try {
    return deserializeAnchors(await readFile(absoluteFile));
  } catch (error) {
    projectIssues.push({
      file: relativeMetadataFile(metadataRoot, absoluteFile),
      message: errorMessage(error),
    });
    return [];
  }
}

function relativeMetadataFile(metadataRoot: string, file: string): string {
  const relative = path.relative(metadataRoot, file).split(path.sep).join("/");
  return `.konstelia/${relative}`;
}

function readProjectSource(root: string, relativeFile: string): Promise<string> {
  try {
    assertSafeTourSourcePath(relativeFile);
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error("Invalid anchor source path."));
  }
  const absoluteFile = path.resolve(root, relativeFile);
  const relative = path.relative(root, absoluteFile);
  if (
    path.isAbsolute(relativeFile) ||
    !relative ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return Promise.reject(new Error(`Anchor source '${relativeFile}' must be inside the project root.`));
  }
  return readFile(absoluteFile, "utf8");
}

function formatHumanReport(
  report: Awaited<ReturnType<ValidateTourProject["execute"]>>,
): string {
  const lines = [
    `Konstelia validation: ${report.health}`,
    `Tours: ${report.tours.length}, anchors: ${report.anchors.length}`,
  ];
  for (const issue of report.issues) {
    lines.push(`[broken] ${issue.file}: ${issue.message}`);
  }
  for (const tour of report.tours) {
    lines.push(`[${tour.health}] ${tour.file}${tour.id ? ` (${tour.id})` : ""}`);
    for (const issue of tour.issues) {
      lines.push(`  ${issue.path ? `${issue.path}: ` : ""}${issue.message}`);
    }
  }
  for (const anchor of report.anchors.filter((entry) => entry.health !== AnchorHealth.Healthy)) {
    lines.push(`[${anchor.health}] ${anchor.id} -> ${anchor.file}: ${anchor.reason ?? "Unresolved anchor."}`);
  }
  return lines.join("\n");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not read project metadata.";
}
