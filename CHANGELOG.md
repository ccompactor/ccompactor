# Changelog

## [0.1.7] — 2026-09-14

### Fixed

- **`ccompactor --version` has been reporting `0.1.2` since 0.1.2.** It was a typed constant, and
  nothing connected it to `package.json`, so the one command a user runs to find out whether their
  install updated was the one thing that never changed. The version is now generated from
  `package.json` at build time — which also covers the compiled standalone binaries, that have no
  `package.json` to read at runtime — and a test fails if the two ever disagree.

## [0.1.6] — 2026-09-14

### Fixed

- **The TUI's two handoff actions read as synonyms.** "Extract, then hand off to another agent" and
  "Extract and launch the agent" both imply the next agent starts; they differ in who starts it. They
  are now "Hand off — print the command for the next agent" and "Hand off — and start the next agent
  here", which is the actual choice.

## [0.1.5] — 2026-09-14

### Fixed

- **`doctor` reported the stores and not the backends**, though its description promised both — and
  the backend is the half a developer has to choose before `extract` will summarise anything. It now
  lists which `--llm` modes this machine can use right now, and what `auto` currently resolves to.
  Store paths are no longer padded to a fixed width either.
- **A stray `<summary>` tag rendered as nothing.** The model is asked for an `<analysis>` block then a
  `<summary>` block; when it omitted the closing tag the opening one was passed through to the
  Markdown, where `<summary>` without `<details>` displays as blank.
- **A truncated continuation summary looked finished.** Neither backend read the provider's stop
  reason, so a nine-section summary that stopped after section seven was presented as complete. The
  stop reason is now checked and the artifact says when later sections are missing rather than empty.

## [0.1.4] — 2026-09-14

### Fixed

- **`list` and `find` were misaligned for most of what they listed.** Columns were padded to a fixed
  38 characters, but a codex session id is sixty, so the id ran straight into the size column and the
  first command a developer runs produced soup. Widths now come from the data; the id column takes
  the space left over and, when the terminal is too narrow, is cut from the left — the timestamp
  prefix is already in the modified column, so the tail is the half that identifies the session.
  Piping reads untruncated.

## [0.1.3] — 2026-09-14

### Fixed

- **The brief now answers "which part of the codebase".** A touch count per subsystem, sorted by
  work done, with files that live outside the session's project collapsed into one honest line at
  the end instead of inventing a directory called `Users`.
- **Error signatures name the error, not the wrapper.** Every failed command ends in `Exit code 1`,
  so signing on the first line merged fifteen unrelated failures into one useless entry. Wrapper
  lines are now skipped in favour of the first line that reads like a failure; a failure with no
  output at all says so.
- **The title is a label.** It was the first user message verbatim, which for a session that opens
  with a page of onboarding is a paragraph. Now ≤ 72 characters cut at a word boundary, with the
  goal still quoted in full a few lines below.
- **`Last user request` is a request.** When a session had been compacted, the provider's
  continuation preamble was the last user turn and was quoted as the human's most recent wish. It
  is skipped in favour of the last real one.
- **`expand` resolves pointers the IR dropped.** The IR is a filtered view, so `[evt N]` could
  point at an event the artifact never carried and resolve to nothing. Expansion now falls back to
  the raw transcript line, and masks hook and attachment noise as `[<type>] (no content)`.
- **The transcript output exists.** `extract --format transcript` writes what was actually said,
  oldest first, with `--full` for every tool call and its output.

### Changed

- **The published benchmark comparison is withdrawn.** The per-arm table against
  [sctxx](https://github.com/handyutils/sctxx) compared two runs scored on question sets sharing 3
  of 21 questions, so the percentages were not comparable and the table was not evidence. It is
  replaced by the shared-question count. `ccompactor bench` is documented as a research instrument
  rather than listed among the features.

## [0.1.2] — 2026-09-13

### Added

- **A readable transcript output**: `extract --format transcript` writes what was actually said —
  user and agent turns, oldest first, with tool calls as one line each and `--full` for every call and
  its output. A handoff says where the work stands; this says what happened.

### Changed

- **The TUI was rebuilt** around the three questions it has to answer: which session, is this the one,
  and what do I do with it. Agent filter chips with real counts, a quick look at the newest turns,
  full untruncated session ids, columns for messages and user turns, a menu of named actions with
  their destinations, progress for every operation, and mouse click and wheel. Details in the commit.

### Fixed

- **`--out` never reached the TUI**, which read `program.opts()` before commander had parsed anything
  and so always fell back to `.ccompactor`.
- **The session list could exhaust the heap.** Reading a session kept every event's original record
  and read whole files into arrays of parsed objects, so a 268 MB transcript became hundreds of
  megabytes of live objects. Transcripts stream in two passes now, and a light read drops what it does
  not need: 2.1 s and 113 MB where it previously crashed.
- **`a` meant two different things** in the list and the preview, so the hint line was wrong on one of
  them.
- A Pi session's 62-character id pushed every column after it out of line.

## [0.1.1]

### Changed

- **The TUI wears the same colours as the website.** Safety yellow `#FFD400` on blacktop, with the
  hazard stripe as a header: black-on-yellow for the brand chip and the selected row, a dimmed
  alternate block for the stripe, muted grey for metadata, and a lighter yellow ink for the keys in
  the help line — chosen because plain yellow body text on a light terminal is unreadable. The
  terminal's own background is left alone rather than forced black, which would fight a reader's
  theme.

### Fixed

- **`--out` was silently ignored by `extract`, `handoff` and `bench`.** Adding a global `--out` for
  the TUI made commander intercept the flag wherever it appeared, so the subcommands kept their own
  default and every one of them wrote to `.ccompactor` instead of the directory asked for. There is
  now a single global `--out`, which is what the flag always claimed to be. Caught by downloading the
  released binary and running it — the release worked, and wrote to the wrong place.

## [0.1.0] — 2026-09-12

First release.

- **Reads** Claude Code / OpenClaude, Codex CLI and Pi session transcripts.
- **Writes** `.ccompactor/`: `handoff.md`, `handoff.json`, `ledgers.json`, `provenance.json`,
  `state.json` — a layered artifact whose every claim carries a recoverable `[evt a–b]` pointer.
- **`--llm none` is a first-class mode**: 4,050 tokens in 2 seconds on a 103,757-event session, no
  model, no network.
- **Commands**: `doctor`, `list`, `find`, `resolve`, `extract`, `expand`, `verify`, `handoff`,
  `skill`, `bench`, `--tui`.
- **Benchmarked in the open**, including where it loses: retrieval ~38% against its Rust sister
  project sctxx's ~73% on the same session, same questions, same backend, three runs each.

## [Unreleased]

### Added

- **Codex CLI and Pi adapters**, alongside Claude Code. `doctor` now reports all three stores, and
  `list`/`find`/`extract` work across them: 339 Claude, 194 Codex and 174 Pi sessions on the machine
  this was developed on.
- **`ccompactor handoff <ref> --to <agent> [--run]`** — extracts, then prints or launches the target
  agent with the artifact preloaded. The flags were verified against installed versions rather than
  assumed: `claude --append-system-prompt-file`, `pi --append-system-prompt`. Codex has no
  equivalent, so it gets a pointer and the instruction to read it first.
- **`ccompactor skill install|uninstall|path`** — the Agent Skill, installed where Claude, Codex and
  Pi already look.
- **`--tui`** — an Ink session browser: filter, search, extract, handoff, without knowing any flags.
  It hands the terminal to the launched agent rather than embedding it.
- **`ccompactor bench`** — the handoff benchmark sctxx ships, ported so the two tools' numbers are
  comparable. Four arms (`none`, `tail`, `artifact`, `retrieval`), questions drawn from the session's
  own events rather than from the artifact, and `--out` to write `bench.json` and `bench.md`
  together.
- `ccompactor expand` pages in exact, non-overlapping ranges and says how to reach the next page.

- **Installable and launchable.** npm workspaces at the repo root; `npm install && npm run build &&
  npm run link` gives a real `ccompactor` command. Runtime dependencies are declared, not implied:
  commander, ink and react. Verified end to end with `which ccompactor`, `--version`, `doctor`, and
  an extract through the global binary.
- The publish guard now checks **`dist/` as well as `src/`**. It only looked at the source directory,
  and `dist/` is what `files` actually puts in the tarball — a guard that checks the first would
  happily publish the second.

### Added

- **An episode index in L3.** The artifact now lists every episode it did not carry verbatim —
  event range, headline, size — so a reader who can ask for more knows *what* to ask for. This was
  the entire head-to-head gap against sctxx on the same sessions: same arms, same questions, same
  backend, and retrieval scored 38% against 69% purely because sctxx's artifact named the ranges and
  ccompactor's did not.

### Changed

- **Head to head against sctxx, measured, and ccompactor is behind.** Same session, same four arms,
  same questions, same backend, three runs each: retrieval ~38% against sctxx's ~73%, deep class ~4/12
  against ~9/12. The ranges do not overlap, so the gap is real. Three defects were found and fixed by
  running it — a front-truncated episode index, assistant keys that scored phrasing rather than
  retrieval, and a `tail` arm of 1,955,968 tokens — and none of them closed it. The cause is not yet
  identified. Full write-up in the test project's `.ccompactor/COMPARISON.md`.
- A verbatim recency tail was added to the artifact, measured, and **removed**: it made retrieval
  worse (38% → 27%) at three times the tokens. The negative result is recorded in the source.

### Fixed

- **`verify` reported every quote as missing.** It compared the artifact's cleaned, whitespace-
  collapsed quote against the raw transcript byte for byte, so a correct quote failed. Both sides are
  now normalized.
- **The Pi adapter parsed nothing.** Written from a guess at the format, it returned 0 events and 0
  user turns from a real session while reporting success. Rewritten against the actual record shapes:
  128 events and 21 user turns from the same file. `custom_message` records — plugin-injected context
  — are attachments, never intent, because otherwise a news feed ends up in the handoff as something
  the human asked for.
- **A compaction boundary was treated as a branch root.** Claude Code starts a fresh `parentUuid`
  chain at every `/compact`, so walking parents from the newest record stopped there: the first
  working build returned 853 events and 7 user turns from a session with 25,030 and 339. Classifying
  roots by record type made it worse — the boundary record is `type: system`. The fix needs no
  classification at all, and both cases are now tests.
- **`do` was in the interrogative list**, so "Do not edit generated files" was rejected as a question
  and silently dropped.
