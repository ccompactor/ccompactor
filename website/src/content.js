// All page content lives here so the components stay presentational and the
// docs can be edited without touching layout code.

export const VERSION = "0.1.0";
export const REPO = "https://github.com/ccompactor/ccompactor";
export const NPM = "https://www.npmjs.com/package/ccompactor";
export const SISTER = "https://github.com/handyutils/sctxx";
export const NOTICE_URL = `${REPO}/blob/main/NOTICE`;

export const hero = {
  eyebrow: "TYPESCRIPT · MIT · CLAUDE CODE · CODEX CLI · PI",
  title: ["Your context has been", "sitting in a", "finished session."],
  taglines: [
    "Heavy machinery for light context.",
    "We compact your context.",
    "Licensed to compact.",
  ],
  lead:
    "ccompactor reads a coding-agent session straight off disk and crushes it into a compact, " +
    "verified, provenance-linked handoff artifact — so the next agent starts warm instead of blind.",
  install: "npm i -g ccompactor",
  facts: [
    { label: "Requires", value: "Node ≥ 20" },
    { label: "No model needed", value: "--llm none" },
    { label: "Licence", value: "MIT" },
    { label: "Egress", value: "none unless you ask" },
  ],
};

export const proof = {
  before: "103,757 events · one real session",
  after: "4,050 tokens · every claim traceable",
  time: "2.0 s on an M-series laptop, no model called",
  note:
    "The deterministic pass — ledgers, constraints, brief, retrieval index — reads the whole " +
    "transcript and writes a complete artifact with no network call. The same run with " +
    "--llm api:anthropic adds the L1 continuation summary on top.",
};

/**
 * The honest number, given its own disclosure ribbon rather than buried in a
 * table. The instruction to this site was to publish the figure where the tool
 * loses; a caution stripe is the construction-site way to say "read this bit".
 */
export const caution = {
  label: "Caution · honest numbers",
  title: "On the handoff benchmark, ccompactor is behind its sister project.",
  body:
    "Same session, same questions, same backend, three runs each. Retrieval accuracy ~38% for " +
    "ccompactor against ~73% for the Rust original; the deep-question class ~4/12 against ~9/12. " +
    "That gap is the current bottleneck — the retrieval index tells a successor which ranges " +
    "exist, and it is not yet good enough. It is published because a benchmark you only win is " +
    "not a benchmark.",
  href: "#benchmarks",
  linkText: "See the numbers",
};

export const benchmarks = {
  arms: [
    {
      arm: "none",
      what: "The successor agent gets the task and nothing else.",
      why: "The floor. Any handoff that cannot beat this has not handed anything off.",
    },
    {
      arm: "tail",
      what: "The last N tokens of the transcript, verbatim.",
      why: "The obvious baseline, and the one ccompactor measured, then removed.",
    },
    {
      arm: "artifact",
      what: "The L0 brief and the L1 continuation summary, no retrieval.",
      why: "What you get from a single read of the artifact.",
    },
    {
      arm: "retrieval",
      what: "The artifact plus the L3 index, with expansion rounds allowed.",
      why: "The arm that should win. It currently wins by less than it should.",
    },
  ],
  headline: [
    ["Retrieval accuracy", "~38%", "~73%"],
    ["Deep questions", "~4 / 12", "~9 / 12"],
  ],
  meta: [
    ["Session", "One real 103,757-event transcript"],
    ["Questions", "Brief, recent, and deep classes"],
    ["Backend", "The same model for both tools"],
    ["Runs", "Three each, same arms"],
  ],
  removed: {
    title: "A baseline that was measured and then deleted",
    body:
      "The recency tail is the one compaction strategy with an ablation behind it " +
      "(arXiv:2508.21433), so copying it looked obviously right. On the same session, same " +
      "questions, and same backend it made retrieval worse — 38% to 27% across three runs — and " +
      "tripled the token count. More context is not more answer. The arm was removed rather than " +
      "kept for symmetry, and the measurement is what removed it.",
  },
  reproduce: `# four arms, the same questions, whatever backend plays the successor
ccompactor bench claude:7c1e8f82 --arms none,tail,artifact,retrieval --out bench/
# bench/bench.md has the table; --show-answers prints what it actually answered`,
};

export const install = {
  methods: [
    {
      title: "npm, global",
      body: "Needs Node 20 or newer. This is the whole install.",
      code: "npm i -g ccompactor\nccompactor doctor",
    },
    {
      title: "Standalone binary",
      body:
        "One file per platform, no Node runtime needed. Download it from the releases page, " +
        "chmod it, and put it on your PATH.",
      code: `# https://github.com/ccompactor/ccompactor/releases
chmod +x ./ccompactor-<platform>
mv ./ccompactor-<platform> /usr/local/bin/ccompactor
ccompactor doctor`,
    },
    {
      title: "From source",
      body:
        "The workspace builds with tsc. npm run link puts the command on your PATH and leaves " +
        "you on your own edits.",
      code: "git clone https://github.com/ccompactor/ccompactor\ncd ccompactor\nnpm install\nnpm run link",
    },
  ],
};

// Every section is searchable; `text` is the haystack.

export const trust = [
  {
    kicker: "Deterministic first",
    title: "The model is opt-in",
    body:
      "--llm none produces a complete artifact with no model and no network. Parsing, ledgers, " +
      "constraint extraction, redaction, budgets, validation, and rendering are all plain " +
      "TypeScript.",
  },
  {
    kicker: "Provenance",
    title: "Every claim has a pointer",
    body:
      "Each claim carries the [evt a–b] range that justifies it, and ccompactor expand prints " +
      "those events back, paged. Nothing is a claim you cannot check.",
  },
  {
    kicker: "Verbatim quotes",
    title: "Your rules, in your words",
    body:
      "A constraint attributed to the human is a real quote from a real message, not a summary " +
      "of one. ccompactor verify re-checks that the quotes are still in the transcript.",
  },
  {
    kicker: "Verification",
    title: "Re-check it later",
    body:
      "ccompactor verify <dir> re-reads an artifact without re-extracting: does it still match " +
      "its schema, are the quotes still in the transcript, do the files it names still exist.",
  },
  {
    kicker: "Privacy",
    title: "Secrets are redacted",
    body:
      "Redaction runs before any model call and again in the rendered artifact. With --llm none " +
      "there is no network call at all, and there is no telemetry either way.",
  },
  {
    kicker: "Scope",
    title: "It knows what it does not do",
    body:
      "It does not replace live /compact inside a running agent, it never mutates a source " +
      "transcript, and it does not claim bit-identical behaviour with proprietary Claude Code.",
  },
];
export const sections = [
  {
    id: "why",
    number: "01",
    title: "Why this exists",
    lead: "Three jobs a finished transcript is better at than a fresh start.",
    kind: "cards",
    cards: [
      {
        kicker: "Ran out of room",
        title: "The context limit won",
        body:
          "Your agent compacted itself into a paragraph and lost the error you were chasing. " +
          "ccompactor re-reads the original file, which still has all of it.",
      },
      {
        kicker: "Switching agents",
        title: "Yesterday Claude, today Codex",
        body:
          "Session formats are provider-specific and mutually unreadable. ccompactor normalizes " +
          "all of them into one artifact any agent can load.",
      },
      {
        kicker: "Coming back",
        title: "What was I doing?",
        body:
          "Point it at last week's session and get the goal, the last command, the unresolved " +
          "error signatures, and what the work touched.",
      },
      {
        kicker: "Handing over",
        title: "A colleague, or a fresh agent",
        body:
          "ccompactor handoff writes the artifact and launches the target agent with it " +
          "preloaded, so the new session opens already knowing the job.",
      },
    ],
    text: "context limit compaction switching agents claude codex pi resume coming back handoff",
  },
  {
    id: "quickstart",
    number: "02",
    title: "Quick start",
    lead: "Four commands from nothing to a handoff artifact you can read.",
    kind: "steps",
    steps: [
      {
        title: "Install",
        body: "One global npm install, or a standalone binary if there is no Node on the box.",
        code: "npm i -g ccompactor",
      },
      {
        title: "See what is on this machine",
        body:
          "ccompactor doctor reports which agent stores it found and which LLM backends are " +
          "available. It is the first thing to run when something looks empty.",
        code: "ccompactor doctor",
      },
      {
        title: "Find the session",
        body:
          "list is newest-first for this project. find searches ids, project paths, and the first " +
          "thing the human asked for.",
        code: `ccompactor list --limit 5
ccompactor find "auth migration"`,
      },
      {
        title: "Extract the handoff",
        body:
          "Writes .ccompactor/ with handoff.md and four JSON files beside it. --llm none is the " +
          "default-shaped run with no model and no network.",
        code: "ccompactor extract claude:last --llm none --out .ccompactor",
      },
      {
        title: "Hand it to another agent",
        body:
          "Point the target agent at the artifact. --run launches it for you instead of printing " +
          "the command.",
        code: `ccompactor handoff codex:last --to claude
ccompactor handoff codex:last --to codex --run`,
      },
    ],
    text: "quick start install npm link binary doctor list find extract handoff out ccompactor directory node",
  },
  {
    id: "agents",
    number: "03",
    title: "Supported agents",
    lead: "Three transcript formats, read straight off disk. No daemon, no account, no API for them.",
    kind: "reference",
    text:
      "supported agents claude code claude code openclaude codex cli pi store location where are " +
      "sessions stored session refs reference prefix last path jsonl jsonl.zst override root " +
      "ambiguous exit code 3 doctor",
  },
  {
    id: "commands",
    number: "04",
    title: "Commands reference",
    lead: "Eleven commands, every flag, nothing hidden behind a config file.",
    kind: "commands",
    text:
      "commands reference doctor list find resolve extract expand verify handoff skill bench tui " +
      "flags json quiet any-project out llm focus instructions dry-run strict context page",
  },
  {
    id: "pipeline",
    number: "05",
    title: "How it works",
    lead:
      "Deterministic first. TypeScript computes everything that can be computed; a model is " +
      "opt-in and only ever makes the judgment calls.",
    kind: "architecture",
    text:
      "how it works pipeline adapters parse active branch ledgers constraints deterministic mask " +
      "summarise fold llm none api anthropic openai compat render artifact layers provenance " +
      "verify expand redact tokens budget",
  },
  {
    id: "artifact",
    number: "06",
    title: "The artifact",
    lead: "One directory, five files, four layers. Cheapest first, so a successor can stop reading.",
    kind: "artifact",
    text:
      "artifact layers L0 brief L1 continuation summary L2 ledgers L3 retrieval handoff.md " +
      "handoff.json ledgers.json provenance.json state.json evt pointers quotes constraints",
  },
  {
    id: "trust",
    number: "07",
    title: "Why you can trust it",
    lead:
      "Most compaction is a model reading a transcript and writing a paragraph. ccompactor is " +
      "built the other way round.",
    kind: "cards",
    cards: trust,
    text:
      "trust deterministic opt-in provenance pointers verbatim quotes verification privacy " +
      "redaction secrets scope does not do compact mutate telemetry network",
  },
  {
    id: "benchmarks",
    number: "08",
    title: "Benchmarks",
    lead:
      "A handoff benchmark with four arms, run against the same session by two different " +
      "implementations. Including the column where ccompactor loses.",
    kind: "benchmarks",
    text:
      "benchmarks bench four arms none tail artifact retrieval accuracy 38 73 deep questions " +
      "sctxx sister project rust honest comparison tokens measured",
  },
  {
    id: "faq",
    number: "08",
    title: "FAQ",
    lead: "The questions that come up first, answered without hedging.",
    kind: "faq",
    text:
      "faq questions does it replace compact mutate transcript bit identical node version " +
      "secrets redaction offline network licence mit notice anthropic tui skill",
  },
];

export const references = [
  {
    grammar: "<ref> := [<agent>:]<selector>   →   claude:7c1e8f82 · codex:last · pi:<id> · ./session.jsonl",
    rows: [
      ["claude:7c1e8f82", "An id prefix in the Claude Code store, six characters or more"],
      ["claude:last", "The most recent Claude Code session for this project"],
      ["codex:6f1a2b3c", "The same, in the Codex CLI store"],
      ["pi:0193f2a1", "A Pi session id"],
      ["last", "The most recent session, any provider"],
      ["./transcript.jsonl", "A file path; the provider is read from the file itself"],
    ],
  },
];

export const stores = [
  {
    agent: "Claude Code / OpenClaude",
    path: "~/.claude/projects/<encoded-cwd>/<session-id>.jsonl",
    override: "CLAUDE_CONFIG_DIR",
    notes: "The store most people already have. Session ids are the eight-character prefix.",
  },
  {
    agent: "Codex CLI",
    path: "~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl",
    override: "CODEX_HOME",
    notes: "Reads archived sessions and zstd-compressed .jsonl.zst rollouts too.",
  },
  {
    agent: "Pi",
    path: "~/.pi/agent/sessions/--<encoded-path>--/<timestamp>_<session-id>.jsonl",
    override: "PI_ROOT",
    notes: "Store format v1 through v3, including branch summaries.",
  },
];

export const layers = [
  {
    tag: "L0",
    title: "Brief",
    budget: "≤ 1,200 tokens",
    body:
      "Known-broken at the end of the session, the goal, hard constraints quoted verbatim from " +
      "the human, where the work was, what it committed, the last commands with their pass/fail, " +
      "and the verify-first list. Designed to fit one screen.",
  },
  {
    tag: "L1",
    title: "Continuation summary",
    budget: "opt-in",
    body:
      "Model-written prose that picks the thread back up — or, with --llm none, an explicit notice " +
      "that no model ran and that a missing fact should be read as unknown rather than as " +
      "permission.",
  },
  {
    tag: "L2",
    title: "Ledgers",
    budget: "deterministic, no model",
    body:
      "Files touched with their event ranges, commands and outcomes, error signatures with " +
      "occurrence counts, commits, and a census of which tools the session actually used. This " +
      "layer is the evidence the summary cannot replace.",
  },
  {
    tag: "L3",
    title: "Retrieval",
    budget: "index of what was dropped",
    body:
      "Every episode not carried verbatim, labelled with its event range and token cost, sampled " +
      "across the whole session rather than truncated from the front — so a successor can ask for " +
      "evt 41,000 even when the artifact never quoted it.",
  },
];

export const artifactSample = `---
schema: ccompactor.handoff/v1
source: {agent: claude, session: 7c1e8f82, events: 103757, user_turns: 288}
engine: deterministic+none
llm: none
constraints: {found: 3}
---

# Handoff: wire the trust tiers through ModuleHost

> ...treat it as a map, not as ground truth. Run the verify-first commands
> before changing anything, treat "Hard constraints" as binding, and expand
> any \`[evt a–b]\` pointer you need with \`ccompactor expand\`.

## L0 · Brief

**Known-broken at the end of the session**
- TypeError: Cannot read properties of undefined (reading 'capabilities') (×4) [evt 4122]

**Goal** (from the first user message, not model-inferred): Implement the
manifest loader with five trust tiers and make TrustTier 3 sandboxed. [evt 0]

**Hard constraints** (standing instructions, quoted verbatim)
- "Never auto-install extensions from the registry without asking me." [evt 41]

**Where the work was**
- \`packages/ext-engine\` — 31 touch(es)

**Last commands**
- \`pnpm vitest run packages/ext-engine\` — FAILED [evt 4381]

**Verify first**
- \`git status\`
- \`git log --oneline -5\`

## L1 · Continuation summary

> No model ran, so there is no continuation summary. What follows is what
> deterministic passes can prove — the ledgers. ...

## L2 · Ledgers (deterministic, no model)

### Files touched (31)
### Commands (412, 9 failed)
### Error signatures (6)

## L3 · Retrieval

Source: \`~/.claude/projects/-Users-me-app/7c1e8f82.jsonl\`

Expand any pointer:
\`\`\`sh
ccompactor expand claude:7c1e8f82 <a>..<b> --context 3
\`\`\`

**Not carried verbatim** — 341 episode(s), 187,402 token(s), all reachable:
- evt 0–118 · Set up the workspace and pick the manifest shape · 3,940
- evt 4122–4381 · TrustTier 3 enforcement in ModuleHost.spawn · 4,110
- (318 episode(s) between these are not listed; the ranges above are
  contiguous, so any event index in 0–103756 can be asked for directly)`;

export const artifactFiles = [
  ["handoff.md", "The artifact. This is the file a successor reads."],
  ["handoff.json", "The same content as data, schema ccompactor.handoff/v1."],
  ["ledgers.json", "Every deterministic record: files, commands, errors, commits, tool census."],
  ["provenance.json", "Where the artifact came from, and the pointers back into the transcript."],
  ["state.json", "The run's own state: what was found, what was dropped, and why."],
];

export const pipeline = {
  inbound: [
    { name: "Claude Code / OpenClaude", path: "~/.claude/projects" },
    { name: "Codex CLI", path: "~/.codex/sessions" },
    { name: "Pi", path: "~/.pi/agent/sessions" },
  ],
  stages: [
    {
      n: "01",
      title: "Adapters parse",
      who: "deterministic",
      body:
        "Three provider formats are decoded line by line into one event model, ignoring unknown " +
        "fields and surviving malformed lines instead of failing the session.",
    },
    {
      n: "02",
      title: "Ledgers are built",
      who: "deterministic",
      body:
        "Files touched, commands with outcomes, error signatures with counts, commits, and a tool " +
        "census. No model has been mentioned yet, and none is needed.",
    },
    {
      n: "03",
      title: "Constraints are extracted",
      who: "deterministic",
      body:
        "Standing instructions are pulled out by pattern and kept as verbatim quotes with the " +
        "event they came from. A constraint is quoted, never paraphrased.",
    },
    {
      n: "04",
      title: "Secrets are redacted",
      who: "deterministic",
      body:
        "Redaction runs before any model call and again on the rendered artifact, so a key that " +
        "appears in the transcript does not appear in the handoff.",
    },
    {
      n: "05",
      title: "A model may write L1",
      who: "opt-in",
      body:
        "Only here, and only with --llm api:anthropic, api:openai, or api:compat/<model>. Without " +
        "it the artifact gets an explicit notice instead of an invented summary.",
    },
    {
      n: "06",
      title: "The artifact is rendered",
      who: "deterministic",
      body:
        "L0 through L3 are written to .ccompactor/, every claim carrying the [evt a–b] pointer " +
        "that justifies it.",
    },
  ],
  caption:
    "Everything except stage 05 is TypeScript with no network access. --llm none is not a " +
    "degraded mode: it is the whole pipeline with the optional step switched off, and the " +
    "4,050-token, 2-second run above was exactly that.",
};

export const commands = [
  {
    name: "ccompactor extract <ref>",
    summary: "The main command. Session in, handoff artifact out.",
    flags: [
      ["--out <dir>", "Where the artifact goes. Default .ccompactor"],
      ["--llm <mode>", "none | auto | api:anthropic | api:openai | api:compat/<model>"],
      ["--focus <text>", "Bias the summary toward what you want to do now"],
      ["--instructions <text>", "Extra instructions for the summary pass"],
      ["--dry-run", "Plan the run and print it without writing anything"],
      ["--any-project", "Ignore the project filter when resolving the ref"],
      ["--json", "Emit the artifact as JSON on stdout"],
      ["--quiet", "Suppress progress and diagnostics on stderr"],
    ],
  },
  {
    name: "ccompactor handoff <ref> --to <agent>",
    summary: "Extract, then open a target agent with the context preloaded.",
    flags: [
      ["--to claude|codex|pi", "Which agent continues the work"],
      ["--run", "Launch it, rather than printing the launch command"],
      ["--out <dir>", "Where the artifact goes. Default .ccompactor"],
      ["--llm <mode>", "none | auto | api:<provider>"],
      ["--any-project", "Ignore the project filter when resolving the ref"],
    ],
  },
  {
    name: "ccompactor list",
    summary: "Sessions found in the agents' stores, newest first.",
    flags: [
      ["--agent <kind>", "Restrict to claude, codex, or pi"],
      ["--project <path>", "Sessions belonging to this project. Defaults to cwd"],
      ["--any-project", "Ignore the project filter"],
      ["--limit <n>", "Show at most this many. Default 40"],
      ["--json", "Machine-readable output on stdout"],
    ],
  },
  {
    name: "ccompactor find <query>",
    summary: "Fuzzy search over session id, project, and the human's first message.",
    flags: [
      ["--agent <kind>", "Restrict to claude, codex, or pi"],
      ["--project <path>", "Sessions belonging to this project"],
      ["--any-project", "Ignore the project filter"],
      ["--limit <n>", "Show at most this many. Default 20"],
      ["--json", "Machine-readable output on stdout"],
    ],
  },
  {
    name: "ccompactor resolve <ref>",
    summary: "Say exactly what a reference points at, before you act on it.",
    flags: [
      ["--any-project", "Ignore the project filter"],
      ["--json", "Machine-readable output on stdout"],
    ],
  },
  {
    name: "ccompactor expand <ref> <a>..<b>",
    summary: "Print the events behind an [evt a–b] pointer, in exact pages.",
    flags: [
      ["--context <n>", "Extra events on each side. Default 0"],
      ["--max-payload <tokens>", "Token ceiling per page. Default 4000"],
      ["--page <n>", "Which page to print, 1-based. Default 1"],
      ["--any-project", "Ignore the project filter"],
    ],
  },
  {
    name: "ccompactor verify <dir>",
    summary: "Re-check an artifact: schema, quotes in the transcript, files on disk.",
    flags: [
      ["--strict", "Exit 7 when a quote cannot be found in the transcript"],
      ["--json", "Machine-readable report on stdout"],
    ],
  },
  {
    name: "ccompactor bench <refs...>",
    summary: "Measure whether a handoff artifact actually hands anything off.",
    flags: [
      ["--arms <list>", "none,tail,artifact,retrieval. Default all four"],
      ["--llm <mode>", "The backend that plays the successor agent"],
      ["--brief / --deep / --recent <n>", "How many questions of each class"],
      ["--expansions <n>", "Retrieval rounds allowed. Default 3"],
      ["--out <dir>", "Write bench.json and bench.md here"],
      ["--show-answers", "Print what the successor answered for each question"],
    ],
  },
  {
    name: "ccompactor doctor",
    summary: "Which agent stores and LLM backends were found on this machine.",
    flags: [["--json", "Machine-readable output on stdout"]],
  },
  {
    name: "ccompactor skill <action>",
    summary: "Install, uninstall, or locate the Agent Skill your agents read.",
    flags: [["install | uninstall | path", "The three actions"]],
  },
  {
    name: "ccompactor --tui",
    summary: "An interactive browser — filter, fuzzy search, extract, handoff.",
    flags: [["--tui", "Open it. Built with Ink and React"]],
  },
];

export const faqs = [
  {
    q: "Does it replace /compact inside a running agent?",
    a:
      "No. ccompactor reads finished sessions from disk. It compacts the session you already had " +
      "into something the next agent can continue from; it does not insert itself into a live " +
      "context window.",
  },
  {
    q: "Does it modify or delete my transcripts?",
    a:
      "Never. The agent stores are opened read-only. The artifact is written to .ccompactor/ in " +
      "your project, and that is the only thing ccompactor creates.",
  },
  {
    q: "Do I need an API key?",
    a:
      "No. --llm none, and it produces a complete artifact with no model and no network. An API " +
      "backend only adds the L1 continuation summary, which is prose on top of the ledgers the " +
      "deterministic pass already produced.",
  },
  {
    q: "Which backends can write the L1 summary?",
    a:
      "api:anthropic, api:openai, and api:compat/<model> for any OpenAI-compatible endpoint — " +
      "OpenRouter, DeepSeek, Ollama, vLLM, LM Studio. Set the base URL for the compat form.",
  },
  {
    q: "What does ccompactor doctor tell me?",
    a:
      "Every agent store it looked for and whether it found one, plus the backends it can see. If " +
      "list comes back empty, doctor is the command that explains why.",
  },
  {
    q: "How do I check an artifact is still true?",
    a:
      "ccompactor verify <dir>. It re-reads the artifact without re-extracting: does the schema " +
      "still hold, are the quoted constraints still in the transcript, do the files it names " +
      "still exist. --strict makes a missing quote a non-zero exit.",
  },
  {
    q: "What happens to secrets in the transcript?",
    a:
      "They are redacted before any model call and again in the rendered artifact. With --llm " +
      "none nothing leaves the machine at all. Redaction is pattern matching, not a guarantee — " +
      "read anything before you share it.",
  },
  {
    q: "Is it a drop-in replacement for its sister project?",
    a:
      "It is the same architecture in a different language, and the two agree on behaviour rather " +
      "than implementation. On the shared handoff benchmark the Rust original is currently ahead " +
      "— that number is on this page, in the benchmarks section, on purpose.",
  },
  {
    q: "What is the licence?",
    a:
      "MIT for ccompactor's own code. There is no Anthropic-derived code in the repository at " +
      "all; NOTICE records exactly what was removed and why, and which published research the " +
      "compaction design follows.",
  },
];

export const footer = {
  note:
    "Heavy machinery for light context. ccompactor reads sessions; it never rewrites them.",
  columns: [
    {
      label: "Project",
      links: [
        { text: "GitHub", href: REPO },
        { text: "Releases", href: `${REPO}/releases` },
        { text: "npm", href: NPM },
      ],
    },
    {
      label: "Docs",
      links: [
        { text: "Commands", href: "#commands" },
        { text: "The artifact", href: "#artifact" },
        { text: "Benchmarks", href: "#benchmarks" },
        { text: "FAQ", href: "#faq" },
      ],
    },
    {
      label: "Elsewhere",
      links: [
        { text: "The sister project", href: SISTER },
        { text: "MIT licence", href: `${REPO}/blob/main/LICENSE` },
        { text: "NOTICE", href: NOTICE_URL },
      ],
    },
  ],
};
