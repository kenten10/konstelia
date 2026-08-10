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

## Milestone 12: Tour editor and flow diagram

- [x] Add `updateTour` so an edited document replaces its own file through an atomic temporary write.
- [x] Validate authored documents with the schema, anchor registry, and catalog rules before saving.
- [x] Add a dedicated tour editing webview for metadata, steps, hops, anchor references, and cross links.
- [x] Build the flow graph in the domain and lay it out and render it as SVG in vscode-free presentation modules.
- [x] Show the diagram in the panel area and preview it live while editing.
- [x] Subscribe the diagram to `TourPlayer` and let a node request a jump during playback.
- [x] Report anchor health in the diagram through the shared `ValidateTourProject` path.
- [x] Restore editors after a window reload and serialize tour writes the way the anchor registry does.

## Milestone 13: Review follow-up

- [x] Compose tour health from `assessTourAnchors` alone so a broken secondary stays drifted (§7.3, §7.4).
- [x] Expose `Konstelia: End Tour` and end playback when its popover document is closed.
- [x] Make the last hop advance into the completed state and report it (§6.2).
- [x] Keep unsaved editor changes visible when a save finishes after them.
- [x] Ship only the extension bundle and the sample tour in the VSIX.
- [x] Treat an in-place edit of anchored code as healthy while still catching ordinal drift.
- [x] Distinguish a missing file from an unreadable one, and serialize every tour write.
- [x] Separate CLI usage errors from validation failures and cover drifted, human, and argument cases.
- [x] Fix C# verbatim strings, `else if`, and self-call detection; Ruby heredocs, singleton classes, and one-line definitions.
- [x] Keep local functions and function-scoped object literal members out of symbol paths (§4.4).

## Milestone 14: Authoring completeness

- [x] Create anchors from the tour editing screen using the author's last source selection.
- [x] Add `Konstelia: Delete Tour`, warning about the tours that reference the one being deleted.
- [x] Add the Marketplace icon, keywords, categories, and a changelog.
- [x] Make `TourLocation` carry URI strings so no vscode type reaches the domain or application layers.
- [x] Keep unsaved editor work across a window reload, and let structural edits be undone.
- [x] Activate only for workspaces that contain tours, or when a command asks for Konstelia.
- [x] Move the editor page markup out of the vscode-facing module so its CSP and escaping are tested.

## Milestone 15: Reader and author choices

- [x] Start a tour from a flow diagram node, through the same checks the tour picker applies.
- [x] Add `Konstelia: Rename Tour`, rewriting the references other tours make to the old id.
- [x] Contribute settings for the diagram and themable colors for the playback highlight.

## Milestone 16: Consolidation

- [x] Declare the storage port in `application` and let `infrastructure` implement it.
- [x] Describe the scopes once, in the domain, instead of in every command.
- [x] Report a reference no registry answers with one message from one traversal.
- [x] Delete the unused `LoadTour` use case.
- [x] Guard the layering with a test instead of a convention.

## Milestone 17: Measured performance and freshness

- [x] Parse a file once per repair scan instead of twice per candidate.
- [x] Resolve the anchors of a hop again when it is shown, so a mid-tour edit does not misplace it.

## Milestone 18: Language coverage

- [x] Address Swift `init`, `deinit`, and `subscript` members.
- [x] Count `while` and `do` loops as `for` refinements in TypeScript, matching the other adapters.
- [x] Count a Python `match` as a `switch` refinement and a Python `while` as a `for` refinement.

## Deferred

Animation, synchronization, AI assistance, languages beyond the adapters listed above, advanced Git detection, and multi-root repository selection are intentionally deferred. Two consequences of the flow diagram are deferred as well: restoring the panel layout that existed before a tour started (specification §6.4 pairs taking the layout over with restoring it) and preserving YAML comments when the editing screen writes a tour back.

## Implementation notes

- The VS Code API names workspace-local extension storage `ExtensionContext.storageUri`; there is no `workspaceStorageUri` property in the supported API. The workspace provider receives `storageUri` and handles it being absent.
- The draft specification uses `.codetours`, while the current product requirements specify `.konstelia/tours`. `.konstelia` is canonical for this implementation. A future compatibility feature must migrate `.codetours` explicitly rather than silently merging both locations.
- The draft tour schema has no `version` field, so newly created documents omit it rather than introducing a parallel schema.
- The specification puts the flow diagram in the bottom panel (§6.4), so it is a `WebviewView` in a panel view container rather than an editor `WebviewPanel`. This also keeps the editor columns free for the playback layout.
- The editing screen keeps the tour id read-only. The id determines the file name, so renaming it is a move, not an edit, and belongs to a separate command. The editing host is bound to the id it was opened with and refuses documents that carry a different one.
- The flow graph is a projection of a tour, so it lives in `domain`. Layout geometry and SVG markup are rendering decisions and live in `presentation`, but they import no vscode API and are unit tested directly. Moving them into `domain` would only be worth it if the CLI ever renders diagrams.
- Playback owns the loop that waits for an action, so a view cannot call `TourPlayer.gotoHop` directly without leaving that loop blocked. `TourPlaybackController` is the input port playback hands to its observers; extending it to the remaining §6.1 events is the natural next step if another view needs them.
- Specification §7.3 blocks readers from opening a broken tour. The flow diagram marks broken anchors and shows ⚠ in the picker but does not block, because the diagram is how an author finds what to repair. Whether a reader-facing diagram must apply the same block as playback is still open.
- Specification §10(C), snapshot auto-update, is decided as **not needed**. A resolved symbol whose text changed but whose saved text exists nowhere else is healthy, because the anchor still points at what the author chose. The snapshot is only consulted to detect an ordinal that moved to another declaration and to offer repair candidates, so `anchors.yaml` is never rewritten by a validation event and reviews stay free of snapshot noise. The cost is that this protection weakens once the anchored code is edited, which is the same trade-off as any content-based check.
- Specification §10(F) is decided against the `default.member` pseudo-segment: members of an anonymous default export cannot be addressed, and the tool asks the author to name the export. The same §4.4 rule now also excludes local functions and object literal members declared inside a function body.
- `toSafeFilenameStem` is a naming rule of the tour model, so it lives in `domain`. `findUniqueTourUri` stays in `infrastructure` because it needs a filesystem.
- The storage port lives in `application/tours/TourStorage.ts` and `infrastructure` implements it, so `application` imports nothing from `infrastructure` at all. `test/layering.test.ts` fails if that changes.
- `TourLocation` carries URI strings rather than `Uri`. Storage keeps `Uri` internally for writing, and the presentation layer parses the string when it needs to open a document. This is what makes `grep -r 'from "vscode"' src/domain src/application` come back empty (§8).
- The tour editor keeps its working document in webview state, so a window reload restores unsaved work. Only the shape of the stored document is checked, because unsaved work is usually mid-edit and therefore invalid, which the editor is built to display. The check and the state parsing live in `TourEditorState`, away from the vscode API, so they are unit tested.
- Undo covers structural edits only. Inside a text field the browser's own undo is better, so `Cmd+Z` is only intercepted when the focus is outside one.
- Renaming a tour rewrites other tours before it moves the renamed file. A failure in the middle then leaves every reference pointing at a tour that still exists, which validation accepts; the reverse order would leave dangling references.
- Deleting a tour leaves the anchor registry untouched: anchors are shared, so removing them with a tour would break other tours. Dangling references in other tours are surfaced in the confirmation instead.
- Refinement keys describe the shape, not the keyword: every loop is `for` and every multi-way branch is `switch`, in all adapters. Ruby's iterator blocks (`items.each do |item|`) count as `for` for the same reason, which also means a non-looping `do` block is counted; narrowing that would mean guessing which methods iterate.
- A repair scan over a 2,500-line C# file took 18.5s before it parsed once per scan and 74ms after; the text-scanned adapters had been parsing the document twice for every candidate range. The compiler-backed TypeScript adapter was already reusing its `SourceFile` and is unchanged at roughly 0.16ms per candidate.
- A crash between writing a temporary file and renaming it can leave a `.tour.*.tmp` or `.anchors.*.tmp` behind. Sweeping them automatically risks deleting a write that another window has in flight, so they are left for the author to remove; scanning ignores them.
- Validation messages stay in English because the same strings are produced for YAML diagnostics, the CLI, and the editing screen. Only surface text that exists solely in the editing screen is written in Japanese.
