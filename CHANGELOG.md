# Changelog

## [0.1.26] — 2026-09-14

### Fixed

- **The TUI drive tests could not run on any CI runner.** Ink checks `CI` and, when it is set,
  suppresses its live output entirely — it writes only `<Static>` content and returns. On a real pty
  that meant the TUI produced nothing but the mouse-tracking escape, which looked exactly like a
  hang. The harness now clears `CI` and `CONTINUOUS_INTEGRATION` for the child: it hands the program a
  genuine terminal, which is precisely what Ink is declining to write to.

  Finding that took longer than it should have, so the harness now proves itself first — it can run a
  trivial program, the CLI, and a minimal Ink app — and a timeout reports the argv, the pid, the byte
  count and the raw head of what did arrive. Twenty-three identical timeouts with no output said
  nothing; two lines of raw bytes said everything.

### Added

- Tests that drive the real TUI: every sidebar page, every top-bar tab, every bottom-bar button,
  every action in the action dialog, every dialog open and close, and a real extract asserting the
  files the dialog names exist afterwards. They found four bugs before they passed.

## [0.1.17] — 2026-09-14

### Added

- **23 tests that drive the real TUI through a pty.** Every sidebar page opens, every top-bar tab
  filters, every bottom-bar button does what its label says, every action in the action dialog is
  offered and selectable, every dialog opens and closes, and the deterministic extract actually
  writes the files the dialog names. They run the published entry point against a fixture store, so a
  passing test is a working button rather than a rendering that looks right.

  Node cannot allocate a pty and `script(1)` on macOS refuses to start unless its own stdin is
  already a terminal — the one thing a test cannot provide. `tests/helpers/pty-bridge.py` allocates
  one and sets its window size, so the layout under test is a number the test chose. The suite skips
  where there is no pty.

### Fixed

- **`esc` stopped closing the quick look, the action list and the target list.** It was routed
  through the same handler as `enter`, which only dismisses the dialogs that `enter` dismisses.
- **A dialog did not own the keyboard.** `tab` and the agent shortcuts reached the frame behind it,
  so `tab` moved focus and the `enter` meant to open a page closed the dialog instead, and `c`/`x`/`p`
  filtered a list nobody could see.
- **The Skill and Update pages showed nothing** until a key was pressed. Both now say what they do
  and list their keys.
- **The sidebar's focus marker had no space after it**, so a focused row read `❯Sessions` while a
  focused content row read `❯ claude`.
- Two layout regressions the new tests caught within the hour: the top bar's pad and the bottom
  bar's pad each failed to count the joins between blocks, leaving the row a column too wide for Ink
  to keep on one line.

## [0.1.16] — 2026-09-14

### Changed

- **The TUI is a frame rather than a sequence of screens.** A top bar carries the coding agents
  detected on this machine with their real session counts; a sidebar carries one entry per thing the
  tool can do — Sessions, Artifacts, Doctor, Skill, Update, Settings, Exit — each of which also
  exists on the command line; a bottom bar splits navigation from actions, because one flat list of
  shortcuts does not tell a reader which keys move them and which will write a file.

  Decisions moved into pop-up dialogs over the frame, so the list you were reading stays where it
  was: the quick look, the session's actions, which agent to continue in, progress, results, and the
  Doctor report.

  Every cell of every bar is still clickable and the wheel still scrolls, but the geometry moved into
  `src/tui/frame.ts` with unit tests around it. The bug this area had before was a click landing on
  the row below the one it was drawn on, and that is arithmetic.

### Fixed

- **The top bar and the bottom bar could each overflow by one column**, which Ink wraps onto a second
  line and the frame then scrolls. The pad between the top bar's blocks did not account for the join
  between them, and the bottom bar's did not account for the two around its spacer — so the last
  action button was silently dropped from a 120-column terminal.
- **Reports were computed and never drawn.** Doctor, Skill and Update set a report that only the
  dialog renderer read, and only while a different dialog was open.

### Added

- `tests/frame.test.ts` — the sidebar covers every page and reaches none twice, action keys survive a
  narrow terminal while captions do not, and a tab answers only at the columns it was drawn on.

## [0.1.15] — 2026-09-14

### Fixed

- **`doctor` never marked the running copy for an npm or pnpm install.** Those do not symlink; they
  write a shell script that `exec`s node with the real entry point. Resolving the shim with
  `realpath` returned the shim itself, so the running copy matched nothing on `PATH` and every row
  looked equally shadowed. The shim's own `cmd-shim-target=` line is now followed, which is what
  makes the list answer the question it was added to answer.

## [0.1.14] — 2026-09-14

### Added

- **`doctor` lists every `ccompactor` on `PATH`, with the version each one reports**, and marks the
  running copy. `update` prints the same thing before it changes anything.

  This came from a real failure on this machine: `npm root -g` had 0.1.13 installed and its
  `dist/version.js` agreed, yet `ccompactor --version` printed 0.1.12 — a pnpm global install sat
  earlier on `PATH` behind a shim. Both copies were installed correctly, only one of them ran, and
  nothing in the tool mentioned the second one. An updater cannot fix a copy that shadows it; it can
  at least say that it is there.

## [0.1.13] — 2026-09-14

### Added

- **`ccompactor narrate <dir>`** — the cheap second stage. `extract --llm` summarises a budgeted
  digest of the *transcript* (~29,550 input tokens on a 286-event session); `narrate` writes the
  continuation summary from the *artifact* (~5,050), which has already been compressed, verified and
  given provenance pointers. 12.2 s against 35.9 s, 162 MB against 446 MB. The narrative replaces the
  L1 block in `handoff.md`, so the file a successor opens is complete; `--print` leaves it alone.
  Re-narrating costs the same as the first run, because the previous narrative is stripped before the
  artifact is sent.
- **L1 is no longer empty without a model.** It now carries the session's shape read off the ledgers:
  the session in one line, the heaviest stretches of work with their opening request, and an arc
  sampled across the whole session. It says plainly what it cannot tell you rather than apologising
  for not existing — an artifact whose second section is an apology for itself reads as a broken
  tool, and the apology was also wrong.

### Fixed

- **Episode headlines were the harness talking to itself.** A stretch of work after a provider
  compaction opens with the continuation preamble, and a background task finishing arrives as a
  `<task-notification>`, so "where the effort went" listed the two heaviest stretches as prose about
  the tool's own bookkeeping. Episodes are now delimited by real requests, not every human turn. This
  also cleans up the L3 retrieval index, which lists the same episodes.

## [0.1.12] — 2026-09-14

### Added

- **`docs/End2EndCCompactorUsageFlow.md`** — every flag, command, exit code, environment variable,
  output file and schema, with a worked run of each and an honest list of where the experience is
  bad today. Written to be handed to whoever redesigns the UX/DX.

### Fixed

- **`ccompactor --json expand` printed `null`.** The expansion produced a rendered string and nothing
  else, so there was no value to emit — a script asking for the events behind a pointer got nothing.
  It now returns the events, and the text form renders from the same structure so the two cannot
  disagree.
- **The artifact's front matter said `ccompactor: 0.1.2`** through five releases. This was the third
  copy of that stale constant: `--version` was fixed first, then the copy in `handoff.json`, and
  this one hid inside a template literal where a search for a quoted version could not find it. A
  test now fails if the front matter ever spells a version out instead of interpolating it.

## [0.1.11] — 2026-09-14

### Added

- **A clickable top bar, so no shortcut has to be memorised.** Every action on every screen is a
  button, labelled with the key that does the same thing — `[/ search]`, `[↵ quick look]`,
  `[a actions]`, `[q quit]` — and clicking it does exactly what the key does. The agent chips
  (`claude 352`, `codex 194`, `pi 174`) filter on click. On a narrow terminal the captions drop
  before the buttons do, so `[a]` is still a target.
- **Menus respond to the mouse.** Rows, chips, buttons and menu items are clickable; the wheel
  scrolls the session list, the quick look and the action menus.

### Fixed

- **A click on a chip ran a button one row below it.** Hit-testing searched every row's spans and
  took the first match, so clicking the `claude` chip at column 38 hit `[↵ quick look]`, which
  covers the same columns on the bar row — filtering by agent opened the preview instead. Rows now
  own their spans.
- **The bar collapsed to a single button when the terminal size was unknown.** A pty reports
  `columns: 0`, and `0 ?? 100` is `0`, so every layout decision saw a zero-width terminal.
- **Mouse escape sequences were typed into the search box**, spelling `[<0;3;3M` into the query.
- **The brief quoted the same rule twice.** A standing rule is restated with slightly different
  wording, and comparing the text exactly kept every restatement: `Never stage with git add -A…`
  and `Never git add -A/git add .…` were two lines of a seven-line block. Restatements now merge,
  the fullest wording wins, and the highest-ranked one keeps its place. On the reference session
  the block went from 7 lines to 5.

## [0.1.10] — 2026-09-14

### Fixed

- **Every commit in the ledger had `sha: "?"`.** The commit was read from the command line, but most
  commits are written as `git commit -m "$(cat <<'EOF'`, whose first line carries no message — so 97 of
  245 subjects were the literal string `$(cat <<` and not one commit could be identified. The SHA and
  subject are what `git commit` *prints*, and that is where they are now read from, deduplicated by
  SHA. On the reference session this took the ledger from 245 unidentifiable commits to 232 with 204
  real SHAs, and it now finds a superset of what the reference implementation finds.
- **`verify` ran out of memory on a large session.** It read the whole transcript and normalised it
  into a second string, then a third — on a 292 MB transcript that is a heap OOM rather than an
  answer. Quotes are now matched while streaming the file in pages, bounded by a fixed window, and
  the command reports how many ledger paths it actually stats instead of implying all of them.
- **The artifact recorded its tool version as `0.1.2`**, the same stale constant that `--version` had.
- **The retrieval benchmark barely asked for more transcript.** Its prompt stated the mechanism but
  not the condition — a model told "answer from the context, do not guess" has no reason to prefer
  asking over saying NOT FOUND — and the range parser rejected any line with a word after the range.
  Both are fixed; see `playground_ccompactor/METRICS.md` for the measurement.

## [0.1.9] — 2026-09-14

### Fixed

- **No command's exit code reached the shell.** `main()` returned a fixed `0` and then called
  `process.exit(0)`, which discarded the `process.exitCode` every action sets. `verify --strict` has
  documented exit 7 since the first release and always exited 0; `handoff --run` never mirrored the
  agent it launched. Both do now, and the entry point returns what the command decided.
- **`ccompactor update` on a project-local copy exits non-zero** when an update is available and it
  declined to apply it, so a script wrapping it notices. `--check` and `--dry-run` still exit 0,
  because they were asked a question and answered it.
- **`update` installs the npm dist-tag rather than a pinned version**, which is what npm owns, and
  avoids the `notarget` failure a stale registry cache produces on exactly the machines that are
  behind.

## [0.1.8] — 2026-09-14

### Added

- **`ccompactor update`** — move this install to the newest release, working out first what kind of
  install it is. A global npm install is updated with npm; a standalone binary is downloaded,
  checksum-checked and swapped in place of the running executable; a project-local copy is left alone
  with the command that would update it; and a source checkout is refused outright, because that is
  someone's working tree and `npm run link` makes it look like an installed one. `--check` only
  reports, `--dry-run` says what it would do.
- **`SHA256SUMS` on each release.** `update` checks the archive it is about to run in place of itself
  against it. Releases up to 0.1.7 published no sums; those still update, with the gap stated rather
  than hidden. A sum that is present and wrong always stops the update.

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

## [0.1.10] — 2026-09-14

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
