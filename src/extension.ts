import { commands, window, workspace, type ExtensionContext } from "vscode";
import { CreateTour } from "./application/tours/CreateTour";
import { CreateAnchor } from "./application/anchors/CreateAnchor";
import { RepairAnchor } from "./application/anchors/RepairAnchor";
import { DiscoverAnchorRepairs } from "./application/anchors/DiscoverAnchorRepairs";
import { AuthorizeAnchorRepair } from "./application/anchors/AuthorizeAnchorRepair";
import { DefaultTourAnchorRegistryResolver } from "./application/tours/TourAnchorRegistry";
import { ListTours } from "./application/tours/ListTours";
import { ListToursWithHealth } from "./application/tours/ListToursWithHealth";
import { InstallSampleTours } from "./application/tours/InstallSampleTours";
import { PlayTour } from "./application/tours/PlayTour";
import { PlaySampleTour } from "./application/tours/PlaySampleTour";
import { ValidateTourCatalog } from "./application/tours/ValidateTourCatalog";
import { ValidateSavedSource } from "./application/tours/ValidateSavedSource";
import { VsCodeFileSystem } from "./infrastructure/filesystem/VsCodeFileSystem";
import { PersonalTourStorageProvider } from "./infrastructure/storage/PersonalTourStorageProvider";
import { PersonalTourAnchorRegistry } from "./infrastructure/storage/PersonalTourAnchorRegistry";
import { RepositoryTourStorageProvider } from "./infrastructure/storage/RepositoryTourStorageProvider";
import { RepositoryTourAnchorRegistry } from "./infrastructure/storage/RepositoryTourAnchorRegistry";
import {
  FixedRepositoryRootLocator,
  SingleRootWorkspaceLocator,
} from "./infrastructure/storage/RepositoryRootLocator";
import { DefaultTourStorageResolver } from "./infrastructure/storage/TourStorageResolver";
import { WorkspaceTourStorageProvider } from "./infrastructure/storage/WorkspaceTourStorageProvider";
import { WorkspaceTourAnchorRegistry } from "./infrastructure/storage/WorkspaceTourAnchorRegistry";
import { VsCodeTourSourceBindingStore } from "./infrastructure/storage/VsCodeTourSourceBindingStore";
import { RootedTourSourceReader } from "./infrastructure/storage/RootedTourSourceReader";
import { BundledTourSampleCatalog } from "./infrastructure/samples/BundledTourSampleCatalog";
import { DefaultSemanticAnchorAdapter } from "./infrastructure/language/DefaultSemanticAnchorAdapter";
import { VsCodeAnchorSourceCatalog } from "./infrastructure/language/VsCodeAnchorSourceCatalog";
import { BrowseToursCommand } from "./presentation/commands/BrowseToursCommand";
import { CreateTourCommand } from "./presentation/commands/CreateTourCommand";
import { CreateAnchorCommand } from "./presentation/commands/CreateAnchorCommand";
import { RepairAnchorCommand } from "./presentation/commands/RepairAnchorCommand";
import { DiscoverAnchorRepairsCommand } from "./presentation/commands/DiscoverAnchorRepairsCommand";
import { PlaySampleTourCommand } from "./presentation/commands/PlaySampleTourCommand";
import { PlayTourCommand } from "./presentation/commands/PlayTourCommand";
import { InstallSampleToursCommand } from "./presentation/commands/InstallSampleToursCommand";
import { VsCodeBrowseToursUserInterface } from "./presentation/commands/VsCodeBrowseToursUserInterface";
import { VsCodeCreateTourUserInterface } from "./presentation/commands/VsCodeCreateTourUserInterface";
import { VsCodeCreateAnchorUserInterface } from "./presentation/commands/VsCodeCreateAnchorUserInterface";
import { VsCodeRepairAnchorUserInterface } from "./presentation/commands/VsCodeRepairAnchorUserInterface";
import { VsCodePlaySampleTourUserInterface } from "./presentation/commands/VsCodePlaySampleTourUserInterface";
import { VsCodePlayTourUserInterface } from "./presentation/commands/VsCodePlayTourUserInterface";
import {
  pendingSampleInstallationKey,
  VsCodeInstallSampleToursUserInterface,
} from "./presentation/commands/VsCodeInstallSampleToursUserInterface";
import { VsCodeTourPlayback } from "./presentation/playback/VsCodeTourPlayback";
import { TourDiagnostics } from "./presentation/diagnostics/TourDiagnostics";
import { SourceAnchorDiagnostics } from "./presentation/diagnostics/SourceAnchorDiagnostics";
import { OutputChannelLogger } from "./shared/logging/OutputChannelLogger";

export function activate(context: ExtensionContext): void {
  const output = window.createOutputChannel("Konstelia", { log: true });
  const logger = new OutputChannelLogger(output);
  const fileSystem = new VsCodeFileSystem();
  const repositoryRoot = new SingleRootWorkspaceLocator(
    () => workspace.workspaceFolders?.map((folder) => folder.uri),
  );
  const storageResolver = new DefaultTourStorageResolver([
    new PersonalTourStorageProvider(fileSystem, context.globalStorageUri),
    new WorkspaceTourStorageProvider(fileSystem, context.storageUri),
    new RepositoryTourStorageProvider(fileSystem, repositoryRoot),
  ]);
  const anchorRegistryResolver = new DefaultTourAnchorRegistryResolver([
    new PersonalTourAnchorRegistry(fileSystem, context.globalStorageUri),
    new WorkspaceTourAnchorRegistry(fileSystem, context.storageUri),
    new RepositoryTourAnchorRegistry(fileSystem, repositoryRoot),
  ]);
  const sourceBindings = new VsCodeTourSourceBindingStore(context.globalState);
  const sampleRoot = new FixedRepositoryRootLocator(context.extensionUri);
  const sampleStorageResolver = new DefaultTourStorageResolver([
    new RepositoryTourStorageProvider(fileSystem, sampleRoot),
  ]);
  const bundledAnchorRegistry = new RepositoryTourAnchorRegistry(fileSystem, sampleRoot);
  const createTourCommand = new CreateTourCommand(
    new CreateTour(storageResolver),
    sourceBindings,
    new VsCodeCreateTourUserInterface(),
    logger,
  );
  const createAnchorCommand = new CreateAnchorCommand(
    new CreateAnchor(new DefaultSemanticAnchorAdapter(), anchorRegistryResolver),
    new VsCodeCreateAnchorUserInterface(),
    logger,
  );
  const anchorAdapter = new DefaultSemanticAnchorAdapter();
  const anchorSourceCatalog = new VsCodeAnchorSourceCatalog();
  const repairAuthorizer = new AuthorizeAnchorRepair(
    storageResolver,
    anchorRegistryResolver,
    sourceBindings,
  );
  const repairAnchor = new RepairAnchor(
    anchorAdapter,
    anchorRegistryResolver,
    anchorSourceCatalog,
  );
  const repairAnchorUserInterface = new VsCodeRepairAnchorUserInterface(context);
  const repairAnchorCommand = new RepairAnchorCommand(
    repairAnchor,
    repairAuthorizer,
    repairAnchorUserInterface,
    logger,
  );
  const discoverAnchorRepairsCommand = new DiscoverAnchorRepairsCommand(
    new DiscoverAnchorRepairs(
      anchorAdapter,
      anchorRegistryResolver,
      anchorSourceCatalog,
    ),
    repairAnchor,
    repairAuthorizer,
    repairAnchorUserInterface,
    logger,
  );
  const listTours = new ListTours(storageResolver);
  const listToursWithHealth = new ListToursWithHealth(
    storageResolver,
    anchorRegistryResolver,
    new RootedTourSourceReader(fileSystem, repositoryRoot),
    new DefaultSemanticAnchorAdapter(),
  );
  const browseToursCommand = new BrowseToursCommand(
    listTours,
    new VsCodeBrowseToursUserInterface(),
    logger,
  );
  const tourRenderer = new VsCodeTourPlayback(context);
  const playTourCommand = new PlayTourCommand(
    listTours,
    listToursWithHealth,
    new PlayTour(storageResolver, anchorRegistryResolver, tourRenderer.forRoot(repositoryRoot)),
    sourceBindings,
    new VsCodePlayTourUserInterface(),
    logger,
  );
  const playSampleTourCommand = new PlaySampleTourCommand(
    new PlaySampleTour(
      sampleStorageResolver,
      bundledAnchorRegistry,
      tourRenderer.forRoot(sampleRoot),
    ),
    new VsCodePlaySampleTourUserInterface(),
    logger,
  );
  const installSampleToursCommand = new InstallSampleToursCommand(
    new InstallSampleTours(
      new BundledTourSampleCatalog(fileSystem, context.extensionUri, bundledAnchorRegistry),
      storageResolver,
      anchorRegistryResolver,
    ),
    sourceBindings,
    new VsCodeInstallSampleToursUserInterface(context.extensionUri, context.globalState),
    logger,
  );
  const diagnostics = new TourDiagnostics(
    context,
    new ValidateTourCatalog(storageResolver, anchorRegistryResolver),
    logger,
  );
  new SourceAnchorDiagnostics(
    context,
    new ValidateSavedSource(
      storageResolver,
      anchorRegistryResolver,
      sourceBindings,
      new DefaultSemanticAnchorAdapter(),
    ),
    logger,
  );
  context.subscriptions.push(
    output,
    commands.registerCommand("konstelia.createTour", async () => {
      await createTourCommand.execute();
      await diagnostics.refresh();
    }),
    commands.registerCommand("konstelia.createAnchor", async () => {
      await createAnchorCommand.execute();
      await diagnostics.refresh();
    }),
    commands.registerCommand("konstelia.repairAnchor", async () => {
      await repairAnchorCommand.execute();
      await diagnostics.refresh();
    }),
    commands.registerCommand("konstelia.discoverAnchorRepairs", async () => {
      await discoverAnchorRepairsCommand.execute();
      await diagnostics.refresh();
    }),
    commands.registerCommand("konstelia.browseTours", () => browseToursCommand.execute()),
    commands.registerCommand("konstelia.playTour", () => playTourCommand.execute()),
    commands.registerCommand("konstelia.playSampleTour", () => playSampleTourCommand.execute()),
    commands.registerCommand("konstelia.installSampleTours", async () => {
      await installSampleToursCommand.execute();
      await diagnostics.refresh();
    }),
  );
  if (context.globalState.get<boolean>(pendingSampleInstallationKey)) {
    void (async () => {
      await context.globalState.update(pendingSampleInstallationKey, undefined);
      await installSampleToursCommand.execute();
      await diagnostics.refresh();
    })();
  }
  void diagnostics.refresh();
  logger.info("Konstelia extension activated.");
}

export function deactivate(): void {}
