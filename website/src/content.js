// All page content lives here so the components stay presentational and the
// docs can be edited without touching layout code.

export const VERSION = "0.3.0";
export const REPO = "https://github.com/handyutils/sctxx";
export const CRATE = "https://crates.io/crates/sctxx";

export const hero = {
  eyebrow: "RUST · CLAUDE CODE · CODEX CLI · PI",
  title: ["Continue any agent’s", "session in any", "other agent."],
  lead:
    "sctxx reads a coding-agent session transcript from disk and produces a compact, verified, " +
    "provenance-linked handoff artifact — so the next agent starts warm instead of blind.",
  facts: [
    { label: "Install", value: "npm i -g sctxx" },
    { label: "Extract", value: "sctxx extract claude:last" },
    { label: "Works offline", value: "--llm none" },
    { label: "Licence", value: "Apache-2.0" },
  ],
};

export const proof = {
  before: "302 MB transcript · 141,409 events · 288 user turns",
  after: "7.9 KB handoff · 3.2k tokens · every claim traceable",
  time: "5.0 s on an M1 Max, no model called",
  note:
    "Measured on a synthetic tool-output-heavy session, release build. " +
    "The numbers and the command are in specs/004-m1-deterministic-handoff-skeleton/evidence/.",
};

/**
 * The architecture diagram, as a first-class section rather than a decoration.
 * `alt` is not optional here: the image is the fastest way to understand what
 * sctxx is, and a reader using a screen reader gets the same explanation in text.
 */
export const architecture = {
  image: "sctxx_context_extraction_architecture.png",
  alt:
    "sctxx context extraction architecture. Three agent transcripts — Claude Code, " +
    "Codex CLI and Pi — are read by provider adapters that reconstruct the active " +
    "branch. Deterministic Rust then builds the ledgers and masks the rows, which " +
    "branch into a recency tail and into chunks. The chunks go through a premap pass " +
    "and a stateful anchored fold that emits typed operations, which are validated " +
    "into the fold state. The repository check reconciles that state against the " +
    "working tree, and the renderer writes handoff.md with its pointers.",
  caption:
    "The whole path. Everything above the fold is deterministic Rust — parsing, active-branch " +
    "reconstruction, ledgers, masking, segmentation, budgets, validation and rendering. Only the " +
    "premap, the fold and the final pass can call a model, and they are opt-in (`--llm`).",
};

// Every section is searchable; `text` is the haystack.
export const sections = [
  {
    id: "why",
    number: "01",
    title: "Why this exists",
    lead: "Three situations where a transcript on disk is worth more than a fresh start.",
    kind: "cards",
    cards: [
      {
        kicker: "Context limit",
        title: "The session ran out of room",
        body:
          "Your agent compacted itself into a paragraph and lost the error you were chasing. " +
          "sctxx re-reads the original file, which still has everything.",
      },
      {
        kicker: "Switching agents",
        title: "Yesterday in Claude, today in Codex",
        body:
          "Session formats are provider-specific and mutually unreadable. sctxx normalizes all " +
          "of them to one artifact any agent can load.",
      },
      {
        kicker: "Coming back",
        title: "What was I doing?",
        body:
          "Point sctxx at last week’s session and get the goal, the current step, the failing " +
          "command, and the approaches that already failed.",
      },
    ],
    text: "context limit compaction switching agents claude codex pi resume coming back",
  },
  {
    id: "quickstart",
    number: "02",
    title: "Quick start",
    lead: "Install, teach your agents about it, and extract your most recent session.",
    kind: "steps",
    steps: [
      {
        title: "Install",
        body:
          "One static binary, installed from npm for your platform, or built from crates.io if you " +
          "prefer. No runtime, no daemon, no account.",
        code: "npm i -g sctxx       # or: cargo install sctxx",
      },
      {
        title: "Install the Agent Skill",
        body:
          "Writes SKILL.md into Claude Code, Codex, and Pi so they know when to reach for it. " +
          "It refuses to overwrite a file you edited.",
        code: "sctxx skill install",
      },
      {
        title: "Check what was detected",
        body: "Stores, session counts, available LLM backends, and which one --llm auto picks.",
        code: "sctxx doctor",
      },
      {
        title: "Extract",
        body:
          "Writes handoff.md plus the JSON artifacts into .sctxx/. Read handoff.md; the rest is " +
          "there so any claim can be checked.",
        code: "sctxx extract claude:last --out .sctxx/",
      },
    ],
    text: "quick start install cargo skill doctor extract out sctxx directory",
  },
  {
    id: "prompts",
    number: "03",
    title: "Talking to your agent",
    lead:
      "With the skill installed, you do not run sctxx yourself. You say what you want, and the " +
      "agent runs it.",
    kind: "prompts",
    prompts: [
      {
        say: "use sctxx to extract session 7c1e8f82 from claude code and use it here",
        runs: "sctxx extract claude:7c1e8f82 --out .sctxx/",
        note: "The most direct form: you know the id.",
      },
      {
        say: "continue what we were doing in this repo yesterday",
        runs: "sctxx list --limit 5 --json then sctxx extract <ref> --out .sctxx/",
        note: "The agent lists recent sessions for this directory and picks by recency and title.",
      },
      {
        say: "pick up the auth migration work from codex",
        runs: 'sctxx find "auth migration" --agent codex --json',
        note: "Search by topic across titles and user messages.",
      },
      {
        say: "load the last session but focus on finishing the exporter",
        runs: 'sctxx extract last --focus "finish the exporter" --out .sctxx/',
        note: "--focus biases extraction toward the part of the session that matters now.",
      },
      {
        say: "what did that error at the end actually say?",
        runs: "sctxx expand claude:7c1e8f82 4122..4381 --context 3",
        note: "Every [evt a–b] pointer in the artifact expands back to the real events.",
      },
      {
        say: "is that handoff from last week still accurate?",
        runs: "sctxx verify .sctxx/",
        note: "Re-checks the artifact against the current repository without re-extracting.",
      },
    ],
    text:
      "prompts talking agent session id extract continue resume find focus expand verify " +
      "pointer jsonl how to point agent at specific session",
  },
  {
    id: "session-ids",
    number: "04",
    title: "Pointing at a specific session",
    lead: "How to name the session you mean, and where the files live.",
    kind: "reference",
    text:
      "session id jsonl reference claude codex pi last prefix path store location where are " +
      "sessions stored ambiguous exit code 3",
  },
  {
    id: "artifact",
    number: "05",
    title: "What you get",
    lead:
      "Four layers, cheapest first, so an agent can stop reading as soon as it knows enough.",
    kind: "artifact",
    text: "artifact layers L0 L1 L2 L3 brief items recency tail retrieval handoff.md state.json",
  },
  {
    id: "architecture",
    number: "06",
    title: "How it works",
    lead:
      "From three transcript formats to one artifact, with every step that can be deterministic " +
      "being deterministic.",
    kind: "architecture",
    text:
      "architecture diagram pipeline adapters active branch ledgers mask segment chunk premap " +
      "anchored fold typed ops validate state recency tail reconcile render handoff pointers",
  },
  {
    id: "trust",
    number: "07",
    title: "Why you can trust it",
    lead:
      "Most compaction is a model reading a transcript and writing a paragraph. sctxx is built " +
      "the other way round.",
    kind: "cards",
    cards: [
      {
        kicker: "Deterministic first",
        title: "Rust computes what can be computed",
        body:
          "Branch resolution, ledgers, masking, budgets, validation, rendering. A model only makes " +
          "semantic judgments — and --llm none still produces a complete artifact.",
      },
      {
        kicker: "Provenance",
        title: "Every item cites its evidence",
        body:
          "Each claim carries the event range that justifies it, and sctxx expand prints those " +
          "events back. Nothing is a claim you cannot check.",
      },
      {
        kicker: "Verbatim quotes",
        title: "Your rules, in your words",
        body:
          "A constraint attributed to you must quote a real message. An invented quote is rejected " +
          "before it reaches the artifact, and the rejection is recorded in state.json.",
      },
      {
        kicker: "Reconciliation",
        title: "The repository wins",
        body:
          "After extraction, sctxx checks the artifact against your working tree with read-only " +
          "git commands and marks anything stale or contradicted.",
      },
      {
        kicker: "Privacy",
        title: "Secrets never leave",
        body:
          "Redaction runs before any model call, again on the response, and again on the rendered " +
          "artifact. No telemetry. --llm none makes no network call at all.",
      },
      {
        kicker: "Safety",
        title: "Transcripts are data, never instructions",
        body:
          "Nothing found in a session is executed. Every prompt fences transcript text and states " +
          "it must not be followed. Agent CLIs used as backends run in an empty temp directory.",
      },
    ],
    text:
      "trust deterministic provenance verbatim quotes reconciliation privacy redaction security " +
      "prompt injection",
  },
  {
    id: "backends",
    number: "08",
    title: "LLM backends",
    lead: "The fold is optional and works with whatever you already have.",
    kind: "backends",
    text:
      "llm backends none auto cli claude codex pi api anthropic openai compat openrouter deepseek " +
      "ollama vllm lm studio api key subscription",
  },
  {
    id: "commands",
    number: "09",
    title: "Command reference",
    lead: "Every command writes its payload to stdout and its progress to stderr.",
    kind: "commands",
    text: "commands list find show extract expand verify redact skill schema doctor flags",
  },
  {
    id: "workflows",
    number: "10",
    title: "Worked examples",
    lead: "Four things people actually do with this.",
    kind: "workflows",
    text: "examples workflows handoff across agents review contribute fixture ci",
  },
  {
    id: "troubleshooting",
    number: "11",
    title: "Troubleshooting",
    lead: "What the exit codes mean and what to do about them.",
    kind: "faq",
    text: "troubleshooting exit codes ambiguous not found no backend parse failure help",
  },
];

export const references = [
  {
    grammar: "<ref> := [<agent>:]<selector>",
    rows: [
      ["claude:7c1e8f82-…", "A full session id in the Claude Code store"],
      ["codex:6f1a2b3c", "An id prefix, six characters or more"],
      ["pi:last", "The most recent Pi session recorded in this directory"],
      ["last:3", "The third most recent session, any provider"],
      ["./transcript.jsonl", "A file path; the provider is detected from its content"],
      ["7c1e8f82", "No prefix: every store is searched"],
    ],
  },
];

export const stores = [
  {
    agent: "Claude Code",
    path: "~/.claude/projects/<encoded-cwd>/<session-id>.jsonl",
    override: "CLAUDE_CONFIG_DIR, --claude-root",
    notes: "Subagents live in <session-id>/subagents/ and attach with --include-sidechains.",
  },
  {
    agent: "Codex CLI",
    path: "~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl",
    override: "CODEX_HOME, --codex-root",
    notes: "Also reads archived_sessions/ and zstd-compressed .jsonl.zst rollouts.",
  },
  {
    agent: "Pi",
    path: "~/.pi/agent/sessions/--<encoded-path>--/<timestamp>_<session-id>.jsonl",
    override: "--pi-root",
    notes: "Session format v1 through v3, including branch summaries.",
  },
];

export const layers = [
  {
    tag: "L0",
    title: "Brief",
    budget: "≤ 1,200 tokens",
    body:
      "Goal, last user request, current step, next actions, hard constraints with verbatim " +
      "quotes, dead ends, verify-first commands, and what changed in the repository since.",
  },
  {
    tag: "L1",
    title: "Items",
    budget: "rest of --budget",
    body:
      "Every item with its id, confidence, verification status, and [evt a–b] pointers. Then the " +
      "ledgers: files touched, last known command status, unresolved errors, the plan, git.",
  },
  {
    tag: "L2",
    title: "Recency tail",
    budget: "--tail, default 12k",
    body: "The end of the session, near-verbatim. What the agent was actually doing when it stopped.",
  },
  {
    tag: "L3",
    title: "Retrieval",
    budget: "≤ 150 tokens",
    body: "The source file and ready-to-run sctxx expand commands for the pointers that matter.",
  },
];

export const artifactSample = `**Goal** (G1): Implement the manifest loader with five trust tiers,
wire tiers into ModuleHost, and make TrustTier 3 enforce sandboxing. [evt 0–1, evt 12]

**Current step** (S2): Making TrustTier 3 actually sandboxed in ModuleHost.spawn.
\`pnpm vitest run packages/ext-engine\` still fails: TypeError: Cannot read
properties of undefined (reading 'capabilities') at module-host.ts:41:22. [evt 12–15]

**Next actions**
1. (N3) Implement sandboxing enforcement for TrustTier 3, then re-run
   \`pnpm vitest run packages/ext-engine\` until host.test.ts passes. [evt 12–15]
2. (N2) In src/host/module-host.ts:41, resolve the capability set before spawn
   and pass the resolved set, not the raw manifest. [evt 15]

**Hard constraints**
- (C1) "Never auto-install extensions from the registry without asking me." [evt 0]

**Don't retry**
- (X1) Wiring the raw manifest into ModuleHost.spawn — spawn reads
  manifest.capabilities, which is undefined. [evt 7–11]

**Verify first**
- \`git status\` · \`git log --oneline -5\` · \`pnpm vitest run packages/ext-engine\``;

export const artifactFiles = [
  ["handoff.md", "The artifact. This is the one you read."],
  ["handoff.json", "The same content, schema sctxx.handoff/v1."],
  ["state.json", "Every item including superseded, resolved, and dropped ones, plus the operation audit trail."],
  ["ledgers.json", "All deterministic records: files, commands, errors, plan, git."],
  ["report.json", "Diagnostics, token counts, timings, backend warnings."],
];

export const backends = [
  {
    flag: "none",
    needs: "nothing",
    body:
      "Deterministic artifact. Ledgers, recency tail, and next actions derived from the plan and " +
      "failing commands. No network call is made.",
  },
  {
    flag: "auto",
    needs: "whatever is present",
    body: "An API key if one is set, else an installed agent CLI, else none. The default.",
    recommended: true,
  },
  {
    flag: "cli:claude · cli:codex · cli:pi",
    needs: "the agent installed",
    body:
      "Uses the subscription you already pay for. The subprocess runs in an empty temporary " +
      "directory with tool use disabled, so it cannot touch your repository.",
  },
  {
    flag: "api:anthropic · api:openai",
    needs: "ANTHROPIC_API_KEY / OPENAI_API_KEY",
    body: "Direct HTTP. Add a model with api:openai/gpt-4.1-mini.",
  },
  {
    flag: "api:compat/<model>",
    needs: "SCTXX_BASE_URL",
    body:
      "Any OpenAI-compatible endpoint: OpenRouter, DeepSeek, Ollama, vLLM, LM Studio. Set " +
      "SCTXX_API_KEY too if the endpoint needs one.",
  },
];

export const commands = [
  {
    name: "sctxx extract <ref>",
    summary: "The main command. Session in, handoff artifact out.",
    flags: [
      ["--out <PATH>", "A directory writes all five files; .md or .json writes one"],
      ["--llm <BACKEND>", "none, auto, cli:<agent>, api:<provider>[/<model>]"],
      ["--focus \"<TEXT>\"", "What you want to do now; biases extraction"],
      ["--mode fast|standard|full", "fast skips the premap pass"],
      ["--budget / --tail", "Artifact and recency-tail token budgets"],
      ["--repo <PATH>", "Repository to reconcile against"],
      ["--strict", "Exit 7 if the repository contradicts the artifact"],
      ["--include-sidechains", "Include subagent transcripts"],
      ["--since-compact", "Start at the provider's last compaction boundary, using its summary as a low-trust seed"],
      ["--redact strict", "Also mask emails, private IPs, high-entropy strings"],
      ["--dry-run", "Print the plan and estimated tokens, then exit"],
    ],
  },
  {
    name: "sctxx list / find",
    summary: "Discover sessions across every store, newest first.",
    flags: [
      ["--agent claude|codex|pi", "One store only"],
      ["--any-project", "Not just sessions recorded in this directory"],
      ["--limit <N>", "How many to print"],
      ["--json", "Machine-readable, for an agent to parse"],
    ],
  },
  {
    name: "sctxx show <ref>",
    summary: "Print a session as raw JSON, masked rows, or canonical IR.",
    flags: [
      ["--view raw|masked|ir", "masked is what a model would see"],
      ["--range A..B", "Only these canonical event indices"],
      ["--active-branch-only", "Skip rewound and abandoned branches"],
    ],
  },
  {
    name: "sctxx expand <ref> <A..B>…",
    summary: "Turn an [evt a–b] pointer back into the events behind it.",
    flags: [["--context <N>", "Extra events on each side"]],
  },
  {
    name: "sctxx verify <artifact>",
    summary: "Re-check an existing artifact against the repository.",
    flags: [
      ["--repo <PATH>", "Defaults to the artifact's recorded cwd"],
      ["--strict", "Exit 7 on a contradiction"],
    ],
  },
  {
    name: "sctxx redact <path>",
    summary: "Strip secrets from a session file, for contributing a fixture.",
    flags: [
      ["--strict", "Also emails, private IPs, high-entropy strings"],
      ["--check", "Report what would be redacted; write nothing"],
      ["--out <PATH>", "Write here instead of stdout"],
    ],
  },
  {
    name: "sctxx skill install",
    summary: "Teach your agents when and how to call sctxx.",
    flags: [
      ["--target claude|codex|pi", "Repeatable; default is all"],
      ["--scope user|project", "Where to write it"],
      ["--force", "Overwrite a locally modified SKILL.md"],
    ],
  },
  {
    name: "sctxx doctor / schema",
    summary: "What was detected on this machine; the published JSON Schemas.",
    flags: [["sctxx schema handoff|state|ops|ir", "Print a contract"]],
  },
];

export const workflows = [
  {
    title: "Hand a session from Claude Code to Codex",
    body: "The original reason sctxx exists. Nothing provider-specific survives into the artifact.",
    code: `# in the Claude Code project directory
sctxx list --limit 5
sctxx extract claude:7c1e8f82 --out .sctxx/

# then, in Codex
codex
> read .sctxx/handoff.md and continue that work`,
  },
  {
    title: "Recover a session that hit its context limit",
    body:
      "The agent compacted itself and lost detail. The file on disk still has everything, " +
      "including what happened before the compaction boundary.",
    code: `sctxx extract claude:last --out .sctxx/ --mode standard

# the artifact marks the provider's own summary as low-trust
# and re-derives the facts from the raw events`,
  },
  {
    title: "Run it with no API key and no network",
    body:
      "The deterministic artifact still names the files touched, the last command status, the " +
      "unresolved errors, and the next actions from the plan.",
    code: `sctxx extract codex:last --llm none --out .sctxx/
sctxx extract codex:last --llm none --format json | jq '.ledgers.commands'`,
  },
  {
    title: "Contribute a fixture without leaking anything",
    body:
      "Redaction is pattern matching, not a guarantee — always read the result before sharing it.",
    code: `sctxx redact ~/.claude/projects/…/session.jsonl --check
sctxx redact ~/.claude/projects/…/session.jsonl --strict --out fixture.jsonl
# then read fixture.jsonl line by line`,
  },
];

export const exitCodes = [
  ["0", "Success", "—"],
  ["1", "Unexpected error", "Read stderr; open an issue with the message"],
  ["2", "Usage error", "Fix the arguments; sctxx --help lists them"],
  ["3", "Ambiguous session reference", "The candidates are printed as JSON on stdout; pick one"],
  ["4", "Session not found", "Run sctxx list, or sctxx doctor to see which stores were searched"],
  ["5", "Too many unparseable lines", "The file may not be a session file, or the format changed"],
  ["6", "No usable LLM backend", "Use --llm none, or sctxx doctor to see what was detected"],
  ["7", "The repository contradicts the artifact", "Only with --strict; re-extract"],
];

export const faqs = [
  {
    q: "sctxx found no sessions",
    a:
      "Run sctxx doctor: it prints every directory that was searched and whether it exists. If " +
      "your agent stores sessions elsewhere, pass --claude-root, --codex-root, or --pi-root.",
  },
  {
    q: "My reference matched several sessions (exit 3)",
    a:
      "The candidate list is printed as JSON on stdout. Use a longer id prefix, or add an agent " +
      "prefix such as claude: to search one store.",
  },
  {
    q: "It says there is no LLM backend",
    a:
      "That is a notice, not a failure: the deterministic artifact is still written. To enable " +
      "the fold, set an API key or install an agent CLI, then check sctxx doctor.",
  },
  {
    q: "The artifact is bigger than --budget",
    a:
      "The recency tail is governed by --tail and is not counted in --budget. Lower --tail, or " +
      "drop the layer entirely with --layers L0,L1,L3.",
  },
  {
    q: "An item is marked stale or contradicted",
    a:
      "Reconciliation compared it against your working tree and they disagree. The repository is " +
      "right. Expand the item's pointer to see what the session actually did.",
  },
  {
    q: "Can I read the raw session file myself?",
    a:
      "You can, with sctxx show --view masked, which is the same reduced view a model sees. " +
      "Opening the .jsonl directly in an agent is what sctxx exists to avoid.",
  },
];
