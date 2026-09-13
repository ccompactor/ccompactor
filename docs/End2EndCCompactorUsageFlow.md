# End-to-end: everything `ccompactor` can do

A complete inventory of the current command surface, written to be handed to someone designing the
UX/DX. Every flag, every action, every exit code, every file it writes, and a concrete run of each —
followed by an honest list of where the experience is bad today.

**Version this documents:** ccompactor 0.1.11. If the tool disagrees with this file, the tool is
right and the file is a bug.

- `ccompactor --help` — top-level flags and the command list
- `ccompactor <command> --help` — that command's flags
- `ccompactor --version` — the version, generated from `package.json` at build time

---

## 1. The mental model

> Take a coding agent's session transcript, turn it into a compact handoff that a *different* agent
> can continue from, and make every claim in it checkable.

Three ideas carry the whole design:

**A session reference** names a transcript. `claude:1367d688` or `codex:last` or a path to a
`.jsonl`. Most commands take one.

**An artifact** is a directory of files, by default `.ccompactor/`, that describes a session in four
layers:

| layer | file | what it is | who reads it |
| --- | --- | --- | --- |
| L0 Brief | `handoff.md` §1 | goal, hard constraints, where the work was, commits, what is broken | the next agent, first |
| L1 Summary | `handoff.md` §2 | a continuation summary — deterministic stub, or model-written | the next agent |
| L2 Ledgers | `ledgers.json` | files, commands, errors, commits, tool use, user turns — every one with an event index | a script, or a human checking |
| L3 Retrieval | `provenance.json` + `expand` | the index that resolves `[evt a–b]` back to the real transcript | anyone who doubts a claim |

**Provenance** is the point. Every line of the brief ends in `[evt 13281]`, and that pointer resolves
to the actual event in the actual transcript. Nothing is asserted without a way to check it.

The tool is **deterministic first**: `--llm none` produces a complete, useful artifact with no model
and no network. The model adds a prose summary and nothing else. `--llm none` is not a degraded mode.

---

## 2. Install, update, first run

```sh
npm i -g ccompactor          # needs Node ≥ 20
ccompactor doctor            # what is on this machine
ccompactor list              # sessions in this project
ccompactor --tui             # the interactive browser
```

Standalone binaries (no Node) for macOS arm64/x64, Linux x64/arm64 with a `.deb`, and Windows
x64/arm64 are attached to each GitHub release.

```sh
ccompactor update --check    # is there a newer release?
ccompactor update            # take it
```

`update` works out how this copy was installed and does the right thing (see §7).

### The 30-second happy path

```sh
ccompactor list                                  # find the session
ccompactor extract claude:1367d688 --llm none    # write the artifact
cat .ccompactor/handoff.md                       # read it
```

---

## 3. Global flags

These work before or after the subcommand.

| flag | default | meaning |
| --- | --- | --- |
| `--json` | off | machine-readable output on **stdout** instead of the human rendering |
| `--quiet` | off | suppress progress and diagnostics on **stderr** |
| `--out <dir>` | `.ccompactor` | where every writing command puts its files |
| `--tui` | — | open the interactive browser (top level only) |
| `-V`, `--version` | — | print the version |
| `-h`, `--help` | — | help for the command |

**The stdout/stderr contract:** stdout is the payload — artifacts, JSON, a resolved path, the bench
table. Progress, warnings and errors go to stderr. `ccompactor ... > out.json` is always safe.

> **Known trap:** `--out` is *always a directory*. `--out report.md` creates a directory called
> `report.md/` and writes `handoff.md` inside it. There is no way to name the output file. See §12.

---

## 4. Environment variables

| variable | used by | meaning |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | `--llm api:anthropic` | used to be selected automatically by `auto` |
| `OPENAI_API_KEY` | `--llm api:openai` | likewise |
| `CCOMPACTOR_BASE_URL` | `--llm api:compat/<model>` | OpenAI-compatible endpoint base, e.g. `https://api.deepseek.com` |
| `CCOMPACTOR_API_KEY` | `--llm api:compat/<model>` | key for that endpoint |
| `CCOMPACTOR_LLM` | `--llm auto` | pin what `auto` resolves to, e.g. `api:compat/deepseek-chat` |
| `CLAUDE_ROOT` | claude adapter | override `~/.claude/projects` |
| `CODEX_HOME` | codex adapter | override `~/.codex` |
| `PI_HOME` | pi adapter | override `~/.pi/agent/sessions` |

`ccompactor doctor` prints which of these are set, and what `auto` currently resolves to. It never
prints the values.

---

## 5. Session references

Anywhere a `<reference>` is accepted:

| form | example | notes |
| --- | --- | --- |
| `agent:id` | `claude:1367d688-7dcd-43d8-8d4a-30210a3137f6` | full id |
| `agent:prefix` | `claude:1367d688` | any unique prefix |
| `agent:last` | `claude:last` | newest for this agent |
| `last` | `last` | newest across all agents |
| `prefix` | `1367d688` | searched across agents |
| path | `~/.claude/projects/…/abc.jsonl` | the file itself; agent inferred from the path |

Known agent names: `claude`, `openclaude`, `codex`, `pi`, `opencode`, `deepseek`, `generic`.

A prefix that matches **one** session resolves. One that matches **several** exits 3 with the
candidates on stdout as JSON (`ccompactor.ambiguous/v1`). One that matches **none** exits 2.

**Project filter.** `list`, `find`, `extract`, `expand` and `handoff` default to sessions whose cwd
is the current directory. `--any-project` turns that off. This is why `ccompactor list` run from the
wrong directory says "no sessions found" — the fix is `--any-project` or `/`.

---

## 6. Command reference

### 6.1 `doctor` — what is on this machine

```sh
ccompactor doctor
ccompactor --json doctor
```

Prints the three adapter stores with `found` / `not found`, per-agent session counts, and which LLM
backends are usable right now. No flags. JSON schema `ccompactor.doctor/v1`.

```sh
$ ccompactor doctor
ADAPTER   STORE                                STATUS
claude    /Users/you/.claude/projects         found
codex     /Users/you/.codex/sessions          found
pi        /Users/you/.pi/agent/sessions       not found

claude: 352 session(s)   codex: 194 session(s)   pi: 0 session(s)

BACKEND              STATUS
none                 always available (no model, nothing leaves the machine)
auto                 currently resolves to none
api:anthropic        ANTHROPIC_API_KEY not set
api:openai           OPENAI_API_KEY not set
api:compat/<model>   CCOMPACTOR_BASE_URL not set, CCOMPACTOR_API_KEY not set
```

### 6.2 `list` — sessions, newest first

| flag | default |
| --- | --- |
| `--agent <kind>` | all |
| `--project <path>` | current directory |
| `--any-project` | off |
| `--limit <n>` | 40 |

```sh
ccompactor list
ccompactor list --agent claude --limit 10
ccompactor list --any-project
ccompactor --json list --any-project --limit 1
```

```sh
$ ccompactor list --any-project --limit 3
AGENT    ID                                     SIZE       MODIFIED
claude   1367d688-7dcd-43d8-8d4a-30210a3137f6   283.4 MB   2026-09-13 11:21
claude   c36bd8f6-0cb2-4253-bf7e-6663472ed028   13.4 MB    2026-09-13 11:17
codex    2026-09-09T21-37-13-01a087ac-a30a…     1002 KB    2026-09-12 20:56

718 more; raise --limit to see them
```

The id is cut from the left when the terminal is narrower than the id, because a codex id is
`<timestamp>_<uuid>` and the timestamp is already in the MODIFIED column. Piped output is never
truncated. JSON schema `ccompactor.list/v1`.

### 6.3 `find` — search by topic

Same flags as `list`, `--limit` defaults to 20. Matches on id, project path, and the first thing the
human asked for — so a phrase from the task finds the session even if you do not know the id.

```sh
ccompactor find "auth migration"
ccompactor find "pnpm 11.8.0 security" --any-project
ccompactor find "plugins on every surface" --agent claude --limit 5
```

### 6.4 `resolve` — what does this reference point at

| flag | default |
| --- | --- |
| `--any-project` | off |

```sh
$ ccompactor resolve claude:1367d688 --any-project
claude:1367d688-7dcd-43d8-8d4a-30210a3137f6
/Users/you/.claude/projects/-Users-you--projects-acme-app/1367d688-….jsonl
```

Use it before a scripted extract, to fail early on an ambiguous prefix. Schema
`ccompactor.resolve/v1`.

### 6.5 `extract` — the main command

| flag | default | meaning |
| --- | --- | --- |
| `--llm <mode>` | `auto` | `none`, `auto`, `api:anthropic`, `api:openai`, `api:compat/<model>` |
| `--format <kind>` | `handoff` | `handoff` or `transcript` |
| `--full` | off | with `--format transcript`, include every tool call and its output |
| `--focus <text>` | — | bias the model summary toward this |
| `--instructions <text>` | — | extra instructions for the model summary |
| `--dry-run` | off | plan the run, write nothing |
| `--any-project` | off | ignore the project filter |

**Writes** into `--out`: for `handoff`, `handoff.md`, `handoff.json`, `ledgers.json`,
`provenance.json`, `state.json`. For `transcript`, `transcript.md`.

```sh
# deterministic, no model, nothing leaves the machine
ccompactor extract claude:1367d688 --llm none

# to a specific destination
ccompactor --out /tmp/handoffs/1367d688 extract claude:1367d688 --llm none

# with a model-written continuation summary
export CCOMPACTOR_BASE_URL=https://api.deepseek.com CCOMPACTOR_API_KEY=sk-…
ccompactor extract claude:1367d688 --llm api:compat/deepseek-chat

# a readable transcript: what was said, oldest first, tool calls one line each
ccompactor extract claude:1367d688 --format transcript --llm none

# the same, with every tool call and its full output
ccompactor extract claude:1367d688 --format transcript --full --llm none

# what would happen, without doing it
ccompactor extract claude:1367d688 --llm api:compat/deepseek-chat --dry-run
```

`--llm auto` resolves to the first configured backend, else `none`. Output on stdout is the path
written; progress goes to stderr. Schemas: `ccompactor.handoff/v1`, `ccompactor.transcript/v1`.

### 6.6 `expand` — resolve an `[evt a–b]` pointer

| flag | default | meaning |
| --- | --- | --- |
| `--context <n>` | 0 | extra events either side |
| `--max-payload <tokens>` | 4000 | token ceiling per page |
| `--page <n>` | 1 | which page to print |
| `--any-project` | off | ignore the project filter |

```sh
ccompactor expand claude:1367d688 13281..13281
ccompactor expand claude:1367d688 4122..4381 --context 3
ccompactor expand claude:1367d688 0..20000 --max-payload 4000 --page 2
```

Pages are exact and non-overlapping, so a script can walk a large range. Events the IR filtered out
are still resolvable — it falls back to the raw transcript line.

```sh
$ ccompactor --json expand claude:1367d688 10..11 --any-project
{
  "schema": "ccompactor.expand/v1",
  "session": { "agent": "claude", "id": "1367d688-…", "path": "/…/1367d688-….jsonl" },
  "ranges": [
    {
      "from": 10, "to": 11, "start": 10, "end": 11,
      "page": { "index": 1, "of": 1, "first": 10, "last": 11 },
      "events": ["evt 10 [custom-title] {…}", "evt 11 [agent-name] {…}"],
      "tokens": 91
    }
  ]
}
```

`from`/`to` is the pointer that was asked for; `start`/`end` is what `--context` actually covered.
The text form renders from the same structure, so the two cannot disagree. Schema
`ccompactor.expand/v1`.

### 6.7 `verify` — is this artifact still true

| flag | default | meaning |
| --- | --- | --- |
| `--strict` | off | exit 7 when a quote cannot be found |

```sh
ccompactor verify .ccompactor
ccompactor --json verify .ccompactor
ccompactor verify .ccompactor --strict
```

Checks that every quoted constraint still appears in the transcript it cites, and that the ledger's
file paths still exist. Reports `filesClaimed` and `filesChecked` — it stats a sample of 200, and
says so rather than implying it checked them all. Schema `ccompactor.verify/v1`.

Exit codes: `0` ok, `7` a quote is missing under `--strict`.

### 6.8 `handoff` — extract and start the next agent

| flag | default | meaning |
| --- | --- | --- |
| `--to <agent>` | required | `claude`, `openclaude`, `codex`, `pi`, `generic` |
| `--llm <mode>` | `auto` | as `extract` |
| `--run` | off | launch it instead of printing the command |
| `--any-project` | off | ignore the project filter |

```sh
# extract, then print the command to continue in Codex
ccompactor handoff claude:1367d688 --to codex --llm none

# extract, then launch it here
ccompactor handoff claude:1367d688 --to codex --run

# a plain shell command rather than an agent that exists
ccompactor handoff claude:1367d688 --to generic --llm none
```

Each target has its own injection strategy, verified against the installed build rather than
assumed: Claude takes `--append-system-prompt-file`; Codex and Pi have no equivalent and are given
the instruction as their opening prompt.

```sh
$ ccompactor handoff claude:1367d688 --to codex --llm none
resolve
parse
ledgers
triage
summary
write
targets on PATH: claude, codex, pi
codex has no --append-system-prompt; it is given the instruction as its opening prompt
codex "Read /…/.ccompactor/handoff.md first. It is a handoff from an earlier session on this
project; build on that work rather than re-deriving it, and treat its \"Hard constraints\" as binding."
```

With `--run` the child's exit status becomes ccompactor's. Schema `ccompactor.handoff/v1` for the
plan.

### 6.9 `skill` — teach other agents to use this

```sh
ccompactor skill install     # copy the skill into every agent's skill directory
ccompactor skill uninstall    # remove it
ccompactor skill path         # print where it would go, and where the payload is
```

```sh
$ ccompactor skill install
/Users/you/.claude/skills/ccompactor
/Users/you/.codex/skills/ccompactor
/Users/you/.pi/agent/skills/ccompactor
```

This is the DX lever: with the skill installed, another agent knows to run `ccompactor extract` and
read `handoff.md` before touching a codebase. Schema `ccompactor.skill/v1`.

### 6.10 `bench` — does a handoff hand anything off

A research instrument, not a feature you need.

| flag | default |
| --- | --- |
| `--llm <mode>` | `auto` |
| `--arms <list>` | `none,tail,artifact,retrieval` |
| `--brief <n>` | 6 |
| `--deep <n>` | 8 |
| `--recent <n>` | 4 |
| `--expansions <n>` | 3 |
| `--artifact <file>` | — |
| `--questions <file>` | derive your own |
| `--emit-questions <file>` | — |
| `--show-answers` | off |
| `--any-project` | off |

```sh
# derive a question set and share it with another tool, so the scores are comparable
ccompactor bench claude:1367d688 --emit-questions q.json --any-project

# run all four arms against it
ccompactor bench claude:1367d688 --llm api:compat/deepseek-chat \
  --questions q.json --out bench/ --show-answers
```

```sh
$ ccompactor bench claude:1367d688 --llm api:compat/deepseek-chat --questions q.json
arm                   correct    acc    tokens  tok/correct
none                     0/18     0%       477            —
tail                     2/18    11%    214844       107422
artifact                 3/18    17%     91166        30389
retrieval                7/18    39%    141237        20177
```

Writes `bench.json` and `bench.md`, the latter listing every answer so a number can be checked.
Schema `ccompactor.bench/v1`.

### 6.11 `update` — stay current

| flag | default |
| --- | --- |
| `--check` | off |
| `--dry-run` | off |

```sh
ccompactor update --check
ccompactor update
ccompactor update --dry-run
ccompactor --json update
```

Behaves according to how this copy was installed:

| install | what happens |
| --- | --- |
| npm global | re-runs `npm install --global ccompactor@latest` |
| standalone binary | downloads this platform's archive, checks it against the release's `SHA256SUMS`, replaces itself |
| a project's `node_modules` | declines, prints the command for that project, exits 1 |
| a source checkout | refuses, prints the `git pull` command, exits 0 |

Schema `ccompactor.update/v1`.

---

## 7. Exit codes

| code | meaning | who returns it |
| --- | --- | --- |
| 0 | success | everything |
| 1 | runtime failure — missing directory, unknown command, an update declined, the launched agent's status | `verify`, `update`, `handoff --run`, any uncaught error |
| 2 | usage error — bad reference, unknown agent, missing argument, unknown `skill` action | `UsageError` |
| 3 | ambiguous reference — the prefix matched several sessions; candidates are on stdout as JSON | `AmbiguousError` |
| 7 | a quoted constraint was not found in the transcript | `verify --strict` |

A script that wraps ccompactor should branch on 2 and 3 (fix the input) and 7 (the artifact is
stale), and treat 1 as a real failure.

---

## 8. Output files and JSON schemas

| file | written by | schema |
| --- | --- | --- |
| `handoff.md` | `extract`, `handoff` | — |
| `handoff.json` | `extract`, `handoff` | `ccompactor.handoff/v1` |
| `ledgers.json` | `extract` | — |
| `provenance.json` | `extract` | `ccompactor.provenance/v1` |
| `state.json` | `extract` | `ccompactor.state/v1` |
| `transcript.md` | `extract --format transcript` | — |
| `bench.json`, `bench.md` | `bench --out` | `ccompactor.bench/v1` |

stdout schemas: `ccompactor.list/v1`, `ccompactor.find/v1`, `ccompactor.doctor/v1`,
`ccompactor.resolve/v1`, `ccompactor.extract/v1`, `ccompactor.verify/v1`, `ccompactor.update/v1`,
`ccompactor.skill/v1`, `ccompactor.ambiguous/v1`, `ccompactor.transcript/v1`.

Every JSON payload is `{ "schema": "…", … }` so a consumer can branch on the shape.

---

## 9. The TUI

```sh
ccompactor --tui
ccompactor --out /tmp/handoffs --tui
```

Requires a real terminal; it refuses with exit 1 if stdin is not a tty.

```
 ccompactor   720 of 720    all   claude 352   codex 194   pi 174
[/ search] [0 all agents] [↵ quick look] [a actions] [q quit]
  AGENT   SESSION ID                                     MSGS  TURNS      SIZE          MODIFIED
❯ claude  1367d688-7dcd-43d8-8d4a-30210a3137f6               ·      ·  283.4 MB  2026-09-13 11:21
click a row, scroll, or type c/x/p// to narrow
```

**Every shortcut is also a button.** The bar is on row 3 of every screen, and clicking a button does
exactly what its key does. The agent chips filter on click. On a narrow terminal the captions drop
before the buttons do: at 40 columns it reads `[/] [0] [↵] [a] [q]`, all still clickable.

**Everything is clickable:** rows, chips, bar buttons, menu items. The wheel scrolls the session
list, the quick look, and the action menus.

### Screens and keys

| screen | keys | buttons on the bar |
| --- | --- | --- |
| **browse** | `↑` `↓` move · `c` `x` `p` filter agent · `0` all agents · `/` search · `enter` or `space` quick look · `a` `e` `h` actions · `q` quit | `/ search`, `0 all agents`, `↵ quick look`, `a actions`, `q quit` |
| **search** (inside browse) | type · `backspace` · `enter` `esc` finish | same bar |
| **preview** (quick look) | `↑` `↓` scroll · `a` `h` `enter` actions · `esc` `q` back | `a actions`, `esc back to the list` |
| **actions** | `↑` `↓` choose · `enter` run · `esc` back | `↵ run this`, `esc back to the list` |
| **target** (which agent) | `↑` `↓` choose · `enter` fork · `esc` back | `↵ continue in this agent`, `esc back` |
| **running** | — | — |
| **done** | `enter` `esc` `q` back to the list | `↵ back to the list` |

`ctrl-c` quits from anywhere.

There are no vim bindings — `j`/`k` do nothing.

### The action menu

After picking a session, `a` (or the `[a actions]` button) offers:

| action | what it does |
| --- | --- |
| Hand off — print the command for the next agent | fork into a new session and show the command; you run it |
| Hand off — and start the next agent here | the same command, run for you in this terminal |
| Extract handoff — deterministic, no model | brief + ledgers + retrieval index → `<out>/handoff.md` |
| Extract handoff — with a model-written summary | same, with an L1 summary; needs a key |
| Readable transcript — what was said, in order | user and agent turns only → `<out>/transcript.md` |
| Readable transcript — including tool calls | every tool call and its output → `<out>/transcript.md` |
| Verify the artifact already in this directory | re-check quotes and file paths against the transcript |

Every one of these is also a `ccompactor` command; the TUI is a front end for the CLI, not a
separate feature set.

---

## 10. Worked end-to-end flows

### F1 — Nothing to handoff yet: is there a session in this repo?

```sh
cd ~/projects/acme/app
ccompactor doctor
ccompactor list
# nothing? the project filter is looking at this directory only.
ccompactor list --any-project --limit 20
```

### F2 — Find a session by what was asked, not by id

```sh
ccompactor find "pnpm version mismatch" --any-project --limit 5
ccompactor resolve claude:1367d688 --any-project
```

### F3 — Claude Code session → handoff artifact in a chosen destination

```sh
ccompactor --out /tmp/handoff-1367d688 extract claude:1367d688-7dcd-43d8-8d4a-30210a3137f6 --llm none
ls /tmp/handoff-1367d688
# handoff.json  handoff.md  ledgers.json  provenance.json  state.json
cat /tmp/handoff-1367d688/handoff.md
```

Deterministic, offline, and on a 283 MB transcript it takes about 2.6 s and 420 MB of RAM.

### F4 — The same, with a model-written continuation summary

```sh
export CCOMPACTOR_BASE_URL=https://api.deepseek.com
export CCOMPACTOR_API_KEY=sk-…
ccompactor --out /tmp/handoff-1367d688-llm extract claude:1367d688 --llm api:compat/deepseek-chat
```

`--llm auto` would pick this up on its own once the two variables are set. Roughly 35 s and one API
call on the same session.

### F5 — Check a claim rather than trust it

```sh
sed -n '/Hard constraints/,/^$/p' .ccompactor/handoff.md
# - "Never stage with git add -A or git add .; always use explicit file paths" [evt 75296]

ccompactor expand claude:1367d688 75296..75296
```

The pointer resolves to the exact event in the exact transcript. This is the loop that makes the
artifact trustworthy, and it is also its main UX weakness — see §12.

### F6 — Hand a Claude Code session to Codex

```sh
# see the command first
ccompactor handoff claude:1367d688 --to codex --llm none

# or run it now
ccompactor handoff claude:1367d688 --to codex --run
```

### F7 — A Pi session, and a Codex session, the same way

```sh
ccompactor list --agent pi --any-project
ccompactor --out /tmp/pi extract pi:2026-09-11T15-55-05-407Z_01a0912d --llm none

ccompactor list --agent codex --any-project
ccompactor --out /tmp/codex extract codex:2026-09-09T21-37-13-01a087ac --llm none
```

### F8 — A transcript to read, rather than an artifact to feed an agent

```sh
ccompactor --out /tmp/hist extract claude:1367d688 --format transcript --llm none
ccompactor --out /tmp/hist-full extract claude:1367d688 --format transcript --full --llm none
```

### F9 — Make other agents aware of the tool

```sh
ccompactor skill install
```

Then, in any other agent: *"read the handoff from the earlier session before you start."* The skill
tells it to run `ccompactor list`, then `extract`, then read `.ccompactor/handoff.md` first.

### F10 — Scripting: machine-readable, quiet, fail-fast

```sh
set -euo pipefail

ref=$(ccompactor --json list --any-project --limit 1 | jq -r '.sessions[0].id')
ccompactor --quiet --out "/tmp/$ref" extract "claude:$ref" --llm none

if ! ccompactor --quiet verify "/tmp/$ref"; then
  echo "artifact is stale, regenerating from a clean tree" >&2
fi
```

Exit 3 from an ambiguous prefix gives you the candidates as JSON, so a script can disambiguate:

```sh
ccompactor --json extract claude:13 --llm none || jq -r '.candidates[].id' <<<"$(...)"
```

### F11 — An artifact for a session that is not on this machine

```sh
ccompactor --out /tmp/imported extract /path/to/copied/abc.jsonl --llm none
```

A path reference infers the agent from the path; the file does not have to be in a store.

### F12 — Keep it current

```sh
ccompactor update --check || true
ccompactor update
```

### F13 — The interactive route

```sh
cd ~/projects/acme/app
ccompactor --tui
```

Then: click `claude 352` to filter, scroll to a row, click it for a quick look, click `[a actions]`,
click *Extract handoff — deterministic, no model*. No keys required at any point.

### F14 — Benchmark a handoff, fairly

```sh
# one question set, shared by both tools, so the scores mean the same thing
ccompactor bench claude:1367d688 --emit-questions q.json --any-project
ccompactor bench claude:1367d688 --llm api:compat/deepseek-chat --questions q.json --out bench/ --show-answers
```

---

## 11. What the tool deliberately does not do

- **It does not execute anything from a transcript.** Transcripts are data, never instructions.
- **It does not require a model.** Every command works with `--llm none`.
- **It does not run the next agent unless asked.** `handoff` prints the command; `--run` launches it.
- **It does not write into the agent stores.** It reads `~/.claude`, `~/.codex`, `~/.pi` and writes
  only to `--out`.
- **It does not judge whether a handoff resolved the issue.** `bench` measures whether a successor can
  answer questions about the session, which is not the same thing.

---

## 12. Where the UX/DX is bad today

Written down because this file is meant to feed a redesign. Each of these is a real observation from
using the tool, not a wish list.

### The artifact is a directory, but the thing a user wants is a file

`--out` takes a directory and there is no way to name the output file. Every other tool in this space
writes one file at a path you choose. `--out report.md` silently creates a *directory* called
`report.md`.

### Five files, and no statement of which one to read

`handoff.md`, `handoff.json`, `ledgers.json`, `provenance.json`, `state.json`. Nothing in the output
says "read `handoff.md`". A first-time user has to open all five or guess.

### The provenance loop needs the session reference again

`handoff.md` says `[evt 75296]`. To resolve it you must remember or re-derive the session id and run
`ccompactor expand claude:1367d688 75296..75296`. The artifact knows its own session id — it is in
`handoff.json` — but the human-facing file does not carry it in a form you can paste.

### `--any-project` is a flag you need before you know you need it

The project filter is on by default. The first `ccompactor list` in a new shell often prints nothing,
and the error path does not say "there are 718 sessions elsewhere; add `--any-project`".

### The default `--llm` is `auto`, which is surprising in both directions

With no key set, `auto` means `none` — good. With a key set, an extract silently costs money and 35
seconds where the deterministic path took 2.6. There is no confirmation and no cost preview outside
`--dry-run`.

### Two different names for one thing across tools

`ccompactor update` and sctxx's `update` do not have the same install detection; `sctxx bench` calls
the retrieval arm `artifact+retrieval`, ccompactor calls it `retrieval`; sctxx's ledgers say
`user_messages`, ccompactor's say `userTurns`. Anyone comparing them pays for the translation.

### The TUI learns nothing between runs

The agent filter, search and last selection reset every launch. There is no "resume where I was".

### `--json` replaces the human output rather than accompanying it

`--json` is global and the payload is the whole answer, so there is no way to get a progress stream
*and* machine-readable output in one invocation without `--quiet` and a separate call.

### The artifact does not name the file to read

Nothing in `.ccompactor/` says "start with `handoff.md`". Combined with `--out` taking a directory,
a first run ends with a new directory holding five files and no instruction.

### Errors do not suggest the fix

`no session matches '13'` — with no mention of the project filter, of `--any-project`, or of the
sessions that would have matched without it.

### Discovery is three commands deep

`doctor` (are the stores there) → `list` (what sessions) → `find` (which one) → `resolve` (is this the
right one) → `extract`. Nothing offers a single "give me the handoff for whatever was happening in
this directory" command, which is the overwhelmingly common case.

---

## 13. Glossary

| term | meaning |
| --- | --- |
| **session reference** | `claude:1367d688`, `codex:last`, or a path to a `.jsonl` |
| **artifact** | the directory of files an `extract` writes |
| **L0 / L1 / L2 / L3** | brief / continuation summary / ledgers / retrieval index |
| **evt** | the 0-based index of an event in the canonical IR |
| **pointer** | `[evt a–b]`, resolvable with `ccompactor expand` |
| **ledger** | a deterministic list — files, commands, errors, commits, tool use, user turns |
| **constraint** | a standing instruction found by pattern in the human's turns, quoted verbatim |
| **arm** | one of `none`, `tail`, `artifact`, `retrieval` in the benchmark |
| **expansion** | a retrieval round in which the successor asks for a range of raw events |
| **install kind** | how this copy of ccompactor got here — npm global, standalone binary, project-local, source checkout |
