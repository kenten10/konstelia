# Konstelia Implementation Plan

## Milestone 0: Extension foundation

- [x] Establish TypeScript build, linting, tests, and Extension Host launch configuration.
- [x] Register `Konstelia: Create Tour` and add output-channel logging.
- [x] Define the minimal tour domain model without replacing the draft schema.
- [x] Introduce `TourScope`, scoped providers, a resolver, and URI-based filesystem access.
- [x] Create minimal YAML tours in personal, workspace, and repository storage.
- [x] Add application-level create, list, and load entry points plus a playback placeholder.

## Milestone 1: Schema and catalog

- [x] Formalize and validate the draft YAML schema, including steps, hops, links, and prerequisites.
- [x] Surface invalid documents and duplicate IDs as VS Code diagnostics.
- [x] Add a tour catalog UI that can list available scopes without coupling UI to paths.
- [x] Use `.konstelia` as the canonical location and reserve `.codetours` for a future explicit migration path.

## Milestone 2: Semantic anchors

- [x] Turn the TypeScript adapter spike into a VS Code-independent core module.
- [x] Implement strict TypeScript symbol-path parsing, canonical formatting, and generation-to-resolution round trips.
- [x] Implement v0 structural refinement syntax, including unique unnumbered `return` resolution.
- [x] Define and persist scope-aware anchor registries and normalized snapshots.
- [x] Add selection-to-anchor authoring and healthy, drifted, and broken resolution states.
- [x] Add focused adapter and schema tests based on the spike cases.

## Milestone 3: Playback MVP

- [x] Implement the VS Code-independent `TourPlayer` state machine.
- [x] Load the included repository sample and its anchor registry before playback.
- [x] Add sample-only named-symbol navigation, highlighting, hover summaries, and cleanup.
- [x] Add previous, next, completion, and exit behavior for sample playback.
- [x] Generalize playback to selectable tours and semantic refinements.
- [x] Preflight all referenced anchors and apply primary/secondary broken behavior.
- [x] Bind personal tours to source workspaces without adding machine paths to YAML.
- [x] Diagnose missing anchor references and refresh diagnostics after registry changes.
- [x] Revalidate file-referenced anchors on TypeScript source saves using a file-to-anchor-to-tour index.
- [x] Show semantic health in the playback catalog and block broken tours before playback starts.

## Milestone 4: Scope sample fixtures

- [x] Add distinct YAML sample tours for Personal, Workspace, and Repository use.
- [x] Install samples through scope resolvers rather than constructing storage paths in UI code.
- [x] Copy only referenced anchors and reject conflicting existing IDs.
- [x] Verify all three installed samples through the normal `PlayTour` use case.

## Milestone 5: CLI validation

- [x] Share schema, semantic anchor, and tour-health validation with a VS Code-independent service.
- [x] Add `tour validate` with human and JSON reports.
- [x] Return a nonzero exit code when project metadata or an anchor is broken.

## Milestone 6: Anchor repair

- [x] Rebind an existing anchor ID from a validated TypeScript selection.
- [x] Update file, symbol-path, refinement, and snapshot without changing tour references.
- [x] Compare the saved snapshot and selected repair target in a side-by-side diff.
- [x] Automatically discover and rank repair candidates from the current workspace.

## Milestone 7: Python tours

- [x] Add a parser-backed Python semantic anchor adapter.
- [x] Route validation, playback, diagnostics, authoring, and repair by source-file language.
- [x] Support Python class/function symbol paths and v0 structural refinements.
- [x] Add a healthy repository sample tour over Python source files.

## Milestone 8: Additional source languages

- [x] Support JavaScript and JSX through the existing compiler-backed adapter.
- [x] Add parser-backed Go and Rust semantic anchor adapters.
- [x] Add isolated structural scanners for Ruby and Swift.
- [x] Route authoring, playback, diagnostics, validation, and repair across all supported languages.
- [x] Verify symbol and refinement generation-to-resolution round trips for each language.

## Milestone 9: JVM and native source languages

- [x] Add parser-backed Java and C/C++ semantic anchor adapters.
- [x] Add isolated structural scanners for C# and Kotlin.
- [x] Support Java and C# types and methods, C functions, C++ scoped methods, and Kotlin functions.
- [x] Route activation, authoring, playback, diagnostics, validation, and repair for the added file types.
- [x] Verify symbol and refinement generation-to-resolution round trips for all five languages.

## Milestone 10: Multi-language sample tours

- [x] Add runnable repository source samples for every supported language family.
- [x] Add JavaScript, Ruby, Rust, Go, Swift, Java, C#, C, C++, and Kotlin tours.
- [x] Register semantic symbol and refinement anchors for every sample.
- [x] Keep the existing TypeScript and Python tours as the samples for those language families.
- [x] Validate all bundled tours and anchors through the shared CLI and unit-test path.

## Milestone 11: Review hardening

- [x] Compare resolved ranges with saved snapshots to detect ordinal drift.
- [x] Restrict sample installation to the bundled source workspace.
- [x] Enforce one workspace-relative source-path policy in registry loading, CLI, health, and playback.
- [x] Represent Rust modules and Ruby qualified classes in canonical symbol paths.
- [x] Require confirmation when authoring snaps a selection to a broader semantic symbol.
- [x] Serialize registry updates and replace `anchors.yaml` through an atomic temporary file.

## Deferred

Flow diagrams, animation, synchronization, AI assistance, languages beyond the adapters listed above, advanced Git detection, and multi-root repository selection are intentionally deferred.

## Implementation notes

- The VS Code API names workspace-local extension storage `ExtensionContext.storageUri`; there is no `workspaceStorageUri` property in the supported API. The workspace provider receives `storageUri` and handles it being absent.
- The draft specification uses `.codetours`, while the current product requirements specify `.konstelia/tours`. `.konstelia` is canonical for this implementation. A future compatibility feature must migrate `.codetours` explicitly rather than silently merging both locations.
- The draft tour schema has no `version` field, so newly created documents omit it rather than introducing a parallel schema.
