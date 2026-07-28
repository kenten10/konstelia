import type { Uri } from "vscode";
import type {
  ScopedTourSample,
  TourSampleCatalog,
} from "../../application/tours/InstallSampleTours";
import type { TourAnchorRegistry } from "../../application/tours/TourAnchorRegistry";
import { TourScope } from "../../domain/tour/TourScope";
import type { FileSystem } from "../filesystem/FileSystem";
import { deserializeTour } from "../storage/TourYaml";

const templates: readonly { scope: TourScope; file: string }[] = [
  { scope: TourScope.Personal, file: "personal-auth-debugging.tour.yaml" },
  { scope: TourScope.Workspace, file: "workspace-session-refresh.tour.yaml" },
  { scope: TourScope.Repository, file: "repository-auth-overview.tour.yaml" },
];

export class BundledTourSampleCatalog implements TourSampleCatalog {
  public constructor(
    private readonly fileSystem: FileSystem,
    private readonly extensionRoot: Uri,
    private readonly sourceAnchors: TourAnchorRegistry,
  ) {}

  public async loadSamples(): Promise<readonly ScopedTourSample[]> {
    const anchors = await this.sourceAnchors.loadAnchors();
    const anchorsById = new Map(anchors.map((anchor) => [anchor.id, anchor]));
    const samples: ScopedTourSample[] = [];
    for (const template of templates) {
      const uri = this.fileSystem.joinPath(
        this.extensionRoot,
        "samples",
        "tours",
        template.file,
      );
      const tour = deserializeTour(await this.fileSystem.readFile(uri));
      const referencedIds = new Set(
        tour.steps.flatMap((step) =>
          step.hops.flatMap((hop) => hop.anchors.map((reference) => reference.ref)),
        ),
      );
      const referencedAnchors = [...referencedIds].map((id) => {
        const anchor = anchorsById.get(id);
        if (!anchor) {
          throw new Error(`Bundled sample '${tour.id}' references unknown anchor '${id}'.`);
        }
        return anchor;
      });
      samples.push({ scope: template.scope, tour, anchors: referencedAnchors });
    }
    return samples;
  }
}
