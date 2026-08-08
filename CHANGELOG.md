# Changelog

All notable changes to Konstelia are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 - 2026-08-09

### Added

- **Tour editing screen** (`Konstelia: Edit Tour`): edit metadata, steps, hops, anchor
  references, and cross links in a form, with the flow diagram beside it. Anchors can be
  created from the current source selection without leaving the screen.
- **Flow diagram** (`Konstelia: Show Flow Diagram`): a diagram generated from a tour, shown in
  the panel area. During playback it follows `TourPlayer` and a node can jump to its hop.
- `Konstelia: Delete Tour`, which warns about the tours that reference the one being deleted.
- Unsaved editor work now survives a window reload, and structural edits can be undone.
- `Konstelia: End Tour`, available from the Command Palette while a tour is playing.
- The final hop now completes a tour and reports it, instead of only offering to exit.

### Changed

- A broken secondary anchor leaves a tour drifted instead of blocking playback.
- Editing anchored code no longer marks an anchor as drifted. Drift is reported when the saved
  snapshot still exists elsewhere, which is what an ordinal that moved to another declaration
  looks like.
- Local functions and object literal members declared inside a function body are no longer
  symbol path segments.
- The CLI separates usage errors (exit code 2) from validation failures (exit code 1).
- The VSIX no longer contains the CLI bundle or the development tours.
- Konstelia only activates for workspaces that contain tours, or when one of its commands is
  invoked. It no longer activates on every supported source file.

### Fixed

- Playback could be left running with no way to stop it after its editor was closed.
- A jump requested from the flow diagram could deadlock the playback loop.
- The editing screen could report edits as saved when they were made during the write.
- C#: verbatim strings ending in a backslash hid the rest of the file; `else if` was read as a
  member named `if`; a method declaration was read as a call to itself.
- Ruby: `end` inside a heredoc, `class << self`, and single-line definitions broke scope
  tracking.
- Tour files are written atomically and one at a time, and a missing file is no longer confused
  with an unreadable one.

## 0.0.2 - 2026-08-01

### Changed

- Published under the `kenten10` Marketplace publisher.

## 0.0.1 - 2026-08-01

### Added

- Initial public release: semantic anchors for TypeScript/TSX, JavaScript/JSX, Python, Ruby,
  Rust, Go, Swift, Java, C#, C, C++, and Kotlin; tour playback with spotlighting and a hop
  popover; Personal, Workspace, and Repository storage scopes; anchor repair from a selection
  or from discovered candidates; and the `tour validate` CLI.
