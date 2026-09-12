# CCompactor

Extract any coding agent's session into a compact, verified, provenance-linked handoff that any
other agent can continue from.

```sh
ccompactor list                       # what sessions exist
ccompactor find "auth migration"      # find one by topic
ccompactor extract claude:last        # the handoff artifact
ccompactor handoff claude:last --to codex --run
```

Same idea as [sctxx](https://github.com/handyutils/sctxx), in TypeScript.

## Status

Phase 0–1 of [`SPEC.md`](SPEC.md) are done: the CLI, session discovery, the Claude adapter, the
deterministic ledgers, `extract --llm none`, `expand`, and `verify`. The compaction core is
**vendored from openclaude and blocked from publication** — see [`NOTICE`](NOTICE).

```sh
cd packages/ccompactor && npm install && npm run build
node dist/cli.js doctor
node dist/cli.js extract claude:last --llm none --out .ccompactor
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

## Licence

MIT for ccompactor's own code. The vendored directory is **not** MIT and **not** publishable — see
[`NOTICE`](NOTICE).
