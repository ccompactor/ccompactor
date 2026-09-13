# CCompactor

[![CI](https://github.com/ccompactor/ccompactor/actions/workflows/ci.yml/badge.svg)](https://github.com/ccompactor/ccompactor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/ccompactor)](https://www.npmjs.com/package/ccompactor)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-yellow)](LICENSE)

**Extract any coding agent's session into a compact, verified, provenance-linked handoff that any
other agent can continue from.**

📖 **[ccompactor.github.io](https://ccompactor.github.io)** · 📦 **[npm](https://www.npmjs.com/package/ccompactor)**

```sh
ccompactor list                       # what sessions exist
ccompactor find "auth migration"      # find one by topic
ccompactor extract claude:last        # the handoff artifact
ccompactor handoff claude:last --to codex --run
```

Same idea as [sctxx](https://github.com/handyutils/sctxx), in TypeScript.

## Install and run

```sh
npm i -g ccompactor     # the tool
ccompactor doctor
```

Or from source, to work on it:

```sh
npm install          # workspaces; installs commander, ink and react
npm run link         # builds, then points `ccompactor` at this checkout
npm run dev -- doctor   # build and run in one step
```

See [DEVELOPING.md](DEVELOPING.md) for the loop, the checks and how to try it on real sessions.

Standalone binaries (no Node needed) for macOS arm64/x64, Linux x64/arm64 with a `.deb`, and
Windows x64/arm64 are attached to each
[release](https://github.com/ccompactor/ccompactor/releases).

Or without linking:

```sh
npm run ccompactor -- doctor
node packages/ccompactor/dist/cli.js list --any-project
```

Releasing is automated — see [`RELEASING.md`](RELEASING.md). The one manual step
is an npm Automation token stored as the `NPM_TOKEN` secret, because a normal
Publish token is gated behind an OTP prompt that CI cannot answer.

## Status

All phases of [`SPEC.md`](SPEC.md) are implemented: CLI, discovery, three adapters, ledgers,
artifact, verify, expand, handoff, skill and TUI. **No Anthropic-derived code is present** — an
earlier vendored copy was never imported and has been deleted; see [`NOTICE`](NOTICE).

`ccompactor bench` also exists, as a research instrument rather than a feature: it measures whether a
handoff hands anything off, and it is how the recency-tail arm was measured and then deleted. A
previously published comparison against [sctxx](https://github.com/handyutils/sctxx) has been
withdrawn — the two runs were scored on question sets sharing 3 of 21 questions, so the per-arm
percentages were not comparable. On the 22 questions they do share, sctxx answers 14 and ccompactor
3. See [`packages/ccompactor/README.md`](packages/ccompactor/README.md).

```sh
ccompactor list --any-project
ccompactor extract claude:last --llm none --out .ccompactor
ccompactor --tui
```

## Commands

| command | what it does |
| --- | --- |
| `doctor` | which agent stores and backends are on this machine |
| `list` | sessions, newest first |
| `find <query>` | fuzzy search over id, project, and the first thing the human asked |
| `extract <ref>` | the handoff artifact |
| `expand <ref> a..b` | the events behind an `[evt a–b]` pointer, in exact pages |
| `verify <dir>` | re-check an artifact: schema, and whether its quotes are in the transcript |
| `handoff <ref> --to <agent>` | launch a target agent with the context preloaded |
| `--tui` | interactive browser |

Session refs: `claude:7c1e8f82`, `claude:last`, `codex:6f1a2b3c`, or a path to a transcript.

## What it does and does not do

**Does:** read Claude Code / OpenClaude, Codex, and Pi transcripts; build deterministic ledgers of
files, commands, errors and commits; extract the human's binding instructions by pattern; produce a
layered artifact where every claim carries a recoverable pointer.

**Does not:** replace live `/compact` inside a running agent, mutate a source transcript, or claim
bit-identical behaviour with proprietary Claude Code.

## Where things live

| | |
| --- | --- |
| the tool | this repository — `packages/ccompactor` |
| the website | [ccompactor/ccompactor.github.io](https://github.com/ccompactor/ccompactor.github.io) → **[ccompactor.github.io](https://ccompactor.github.io)** |
| releases | [GitHub Releases](https://github.com/ccompactor/ccompactor/releases) — source of the standalone binaries |

The site is its own repository and deploys itself, so nothing here needs to change when it changes.

## Licence

MIT. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

CCompactor contains **no code derived from Anthropic's Claude Code CLI**. An earlier iteration
vendored two modules from a fork of it; nothing imported them, they have been deleted, and
`scripts/guard-vendor.mjs` runs on `prepack` so they cannot come back by accident.
