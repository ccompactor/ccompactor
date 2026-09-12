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
| `ccompactor bench <refs...>` | measure whether a handoff actually hands anything off |

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

## The model is optional

```sh
ccompactor extract claude:last --llm none              # nothing leaves the machine
ccompactor extract claude:last --llm api:anthropic     # ANTHROPIC_API_KEY
ccompactor extract claude:last --llm api:openai        # OPENAI_API_KEY
ccompactor extract claude:last --llm api:compat/<model>  # CCOMPACTOR_BASE_URL + CCOMPACTOR_API_KEY
```

Secrets are redacted before any model call and again in the rendered artifact. Transcript content is
treated as data, never as instructions.

## Benchmarked, including where it loses

`ccompactor` ships a handoff benchmark with four arms — `none`, `tail`, `artifact`, and
`retrieval` (the successor can ask for an event range and be given the real events).

Measured head to head against its Rust sister project [sctxx](https://github.com/handyutils/sctxx) on
the same session, same questions, same backend, three runs each:

| arm | ccompactor | sctxx |
| --- | --- | --- |
| none | 0% | 0% |
| tail | 0–5% | 9% |
| artifact | 25% | 23% |
| **retrieval** | **~38%** | **~73%** |

**ccompactor is behind, and the site says so.** The gap is real — the ranges do not overlap across
repeated runs — and the cause is not yet identified.

## Install without Node

Standalone binaries for macOS (arm64, x64), Linux (x64, arm64, plus `.deb`) and Windows (x64, arm64)
are attached to each [GitHub release](https://github.com/ccompactor/ccompactor/releases).

## Requirements

Node ≥ 20 for the npm install. The standalone binaries need nothing.

## Licence

MIT. Contains no code derived from Anthropic's Claude Code CLI — see [NOTICE](NOTICE).
