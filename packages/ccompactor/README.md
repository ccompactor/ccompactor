# ccompactor

**Extract any coding-agent session into a compact, verified, provenance-linked handoff that any other
agent can continue from.**

Claude Code, Codex CLI and Pi keep their transcripts on disk. `ccompactor` reads one, builds
deterministic ledgers of what actually happened, and writes an artifact you can hand to a *different*
agent so it starts where the last one stopped instead of re-deriving ten days of work.

```sh
npm i -g ccompactor
ccompactor list --any-project
ccompactor extract claude:last --out .ccompactor
```

Then point any agent at `.ccompactor/handoff.md`:

```sh
ccompactor handoff claude:last --to codex --run
```

## What it does

| command | what it does |
| --- | --- |
| `ccompactor doctor` | which agent stores are on this machine |
| `ccompactor list` | sessions, newest first |
| `ccompactor find <query>` | fuzzy search over id, project, and the first thing the human asked for |
| `ccompactor extract <ref>` | the handoff artifact |
| `ccompactor expand <ref> a..b` | the events behind an `[evt a–b]` pointer, in exact pages |
| `ccompactor verify <dir>` | re-check an artifact: are the quotes still in the transcript, do the files still exist |
| `ccompactor handoff <ref> --to <agent>` | launch Claude, Codex or Pi with the context preloaded |
| `ccompactor skill install` | the Agent Skill, so agents know to use it |
| `ccompactor --tui` | an interactive browser — filter, search, extract, handoff |
| `ccompactor bench <refs...>` | measure whether a handoff hands anything off (research) |
| `ccompactor narrate <dir>` | write the continuation summary from an artifact, not the transcript |
| `ccompactor update` | move this install to the newest release |

Session references are `claude:7c1e8f82`, `codex:last`, `pi:<id>`, or a path to a transcript.

## Deterministic first

`--llm none` produces a complete artifact with **no model and no network**. On a real 103,757-event
session that is **4,050 tokens in 2 seconds**.

The artifact has four layers, cheapest first, so a reader can stop as soon as it knows enough:

- **L0 Brief** — the goal, the hard constraints quoted verbatim, where the work was, what it
  committed, the last commands, what to verify first.
- **L1 Continuation summary** — model-written, or an explicit notice that none ran.
- **L2 Ledgers** — files touched with edit counts, commands with outcomes, error signatures ranked by
  repetition, a tool census. All deterministic.
- **L3 Retrieval** — an index of every episode the artifact did not carry, with event ranges, so
  anything dropped is still reachable.

Every claim carries a pointer, and the pointer works:

```sh
ccompactor expand claude:7c1e8f82 4122..4381 --context 3
```

## The interactive browser

```sh
ccompactor --tui
```

A frame with a top bar, a sidebar, a content pane and a bottom bar — and every cell of all three
bars is clickable, so nothing has to be memorised:

```
 ccompactor      all 725   claude 357   codex 194   pi 174                out: .ccompactor
╭────────────────────╮╭──────────────────────────────────────────────────────────────╮
│ Sessions           ││ 725 of 725 session(s)                                        │
│ Artifacts          ││ AGENT   SESSION ID              MODIFIED                     │
│ Doctor             ││❯ claude  c36bd8f6-0cb2-4253…   2026-09-13 18:17   1456 msg   │
│ Skill              ││  claude  1367d688-7dcd-43d8…   2026-09-13 18:10              │
│ Update             ││                                                              │
│ Settings           ││                                                              │
│ Exit               ││                                                              │
╰────────────────────╯╰──────────────────────────────────────────────────────────────╯
 NAV  ←→ pane  ↑↓ move  ⏎ select  / filter  esc back  ? help   ACT  v look  a actions
```

The **top bar** is the coding agents detected on this machine, with real session counts; clicking
one filters to it. The **sidebar** is one entry per thing the tool can do — Sessions, Artifacts,
Doctor, Skill, Update, Settings, Exit — and each exists on the command line too. The **bottom bar**
splits navigation from actions, because one flat list of shortcuts does not tell you which keys
move you and which write a file.

Decisions happen in pop-up dialogs: the quick look, the session's actions, which agent to continue
in, progress, results, and the Doctor report. Items in them are clickable. Rows, tabs, sidebar
entries, bar buttons and dialog items all respond to the mouse, and the wheel scrolls.

On a narrow terminal captions drop before buttons do — at 80 columns the bar reads `ACT  v  a` and
both keys still work.

## The model is optional

```sh
ccompactor extract claude:last --llm none              # nothing leaves the machine
ccompactor extract claude:last --llm api:anthropic     # ANTHROPIC_API_KEY
ccompactor extract claude:last --llm api:openai        # OPENAI_API_KEY
ccompactor extract claude:last --llm api:compat/<model>  # CCOMPACTOR_BASE_URL + CCOMPACTOR_API_KEY
```

Secrets are redacted before any model call and again in the rendered artifact. Transcript content is
treated as data, never as instructions.

## Measuring whether a handoff hands anything off

`ccompactor bench` is a research instrument, not a feature you need. It runs the same task against
four arms — `none`, `tail`, `artifact`, and `retrieval` (the successor can ask for an event range and
is handed the real events) — and reports how many questions each arm answers correctly.

```sh
ccompactor bench claude:last --llm api:compat/deepseek-chat --questions questions.json
```

The point of shipping it is that a handoff tool which cannot demonstrate it beats handing over the
last 20 messages is asking to be believed. On our own sessions the arms separate clearly: `none` and
`tail` score near zero, `artifact` lands around a quarter, and `retrieval` roughly doubles it.

We previously published a table comparing these numbers head to head with
[sctxx](https://github.com/handyutils/sctxx). **That table has been withdrawn.** The two tools were
scored on overlapping-but-different question sets, so the per-arm percentages were never comparable;
only 3 of 21 questions were shared. On the 22 questions the two runs genuinely share, sctxx scores
14/22 and ccompactor 3/22 — ccompactor is behind, the gap is real, and we do not yet know why, since
the retrieval prompts and expansion loop are line-for-line ports. We would rather say that than quote
a number that flattered us.

## Tests

```sh
npm test
```

99 tests. The TUI ones drive the real CLI through a pty against a fixture store — every sidebar page,
every top-bar tab, every bottom-bar button, every action in the action dialog, and a real extract
asserting the files it names exist afterwards. They skip where there is no pty (`tests/helpers/pty.ts`
explains why `script(1)` cannot be used and what a small Python bridge does instead).

## Staying up to date

```sh
ccompactor update            # newest release
ccompactor update --check     # is there one?
```

`update` works out how this copy was installed and does the right thing: a global npm install is
updated with npm, a standalone binary is downloaded and swapped in place, and a source checkout is
refused with the `git pull` command instead — that one is someone's working tree. Standalone
downloads are checked against the release's `SHA256SUMS`.

## Install without Node

Standalone binaries for macOS (arm64, x64), Linux (x64, arm64, plus `.deb`) and Windows (x64, arm64)
are attached to each [GitHub release](https://github.com/ccompactor/ccompactor/releases).

## Requirements

Node ≥ 20 for the npm install. The standalone binaries need nothing.

## Licence

MIT. Contains no code derived from Anthropic's Claude Code CLI — see [NOTICE](NOTICE).
