# Changelog

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
