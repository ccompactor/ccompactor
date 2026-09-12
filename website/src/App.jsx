import { useEffect, useMemo, useState } from "react";
// Vite resolves this to a hashed URL at build time, so the diagram ships with the
// site rather than depending on a path that happens to be served.
import architectureImg from "./assets/img/sctxx_context_extraction_architecture.jpg";
import { apply, readPreference, watchSystem } from "./theme.js";
import {
  CRATE,
  REPO,
  VERSION,
  architecture,
  artifactFiles,
  artifactSample,
  backends,
  commands,
  exitCodes,
  faqs,
  hero,
  layers,
  proof,
  references,
  sections,
  stores,
  workflows,
} from "./content.js";

/** A code block with a copy button that confirms what it did. */
function Code({ children, compact = false }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(children).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      () => setCopied(false),
    );
  };
  return (
    <div className={compact ? "code-block compact" : "code-block"}>
      <button className="copy" onClick={copy} type="button">
        {copied ? "Copied" : "Copy"}
      </button>
      <pre>
        <code>{children}</code>
      </pre>
    </div>
  );
}

function SectionHeading({ number, title, lead }) {
  return (
    <div className="section-heading">
      <span className="section-number">{number}</span>
      <div>
        <h2>{title}</h2>
        <p>{lead}</p>
      </div>
    </div>
  );
}

function Cards({ cards }) {
  return (
    <div className="cards two-col">
      {cards.map((card) => (
        <article className="card" key={card.title}>
          <div className="card-kicker">{card.kicker}</div>
          <h3>{card.title}</h3>
          <p>{card.body}</p>
        </article>
      ))}
    </div>
  );
}

function Steps({ steps }) {
  return (
    <div className="step-list">
      {steps.map((step, index) => (
        <div className="step" key={step.title}>
          <span className="step-number">{index + 1}</span>
          <div className="step-body">
            <h3>{step.title}</h3>
            <p>{step.body}</p>
            <Code compact>{step.code}</Code>
          </div>
        </div>
      ))}
    </div>
  );
}

function Prompts({ prompts }) {
  return (
    <div className="prompt-list">
      {prompts.map((prompt) => (
        <div className="prompt" key={prompt.say}>
          <div className="prompt-say">
            <span className="prompt-label">you say</span>
            <p>“{prompt.say}”</p>
          </div>
          <div className="prompt-runs">
            <span className="prompt-label">the agent runs</span>
            <code>{prompt.runs}</code>
            <span className="prompt-note">{prompt.note}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReferenceSection() {
  return (
    <>
      {references.map((reference) => (
        <div key={reference.grammar}>
          <Code compact>{reference.grammar}</Code>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Means</th>
                </tr>
              </thead>
              <tbody>
                {reference.rows.map(([ref, meaning]) => (
                  <tr key={ref}>
                    <td>
                      <code>{ref}</code>
                    </td>
                    <td>{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="note">
        Without an agent prefix every store is searched. If the id matches more than one session,
        sctxx exits <code>3</code> and prints the candidates as JSON on stdout, so an agent can
        show them to you instead of guessing.
      </p>
      <h3 className="sub-heading">Where the files live</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Path</th>
              <th>Override</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store) => (
              <tr key={store.agent}>
                <td>
                  {store.agent}
                  <span className="cell-note">{store.notes}</span>
                </td>
                <td>
                  <code>{store.path}</code>
                </td>
                <td>
                  <code>{store.override}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * The architecture diagram.
 *
 * A figure, not a decoration: the caption carries the one fact the picture
 * cannot show (which stages may call a model), and the alt text is the whole
 * pipeline in words for a reader who cannot see it.
 */
function ArchitectureSection() {
  return (
    <figure className="architecture">
      <img src={architectureImg} alt={architecture.alt} loading="lazy" />
      <figcaption>{architecture.caption}</figcaption>
    </figure>
  );
}

function ArtifactSection() {
  return (
    <>
      <div className="layer-list">
        {layers.map((layer) => (
          <div className="layer" key={layer.tag}>
            <span className="layer-tag">{layer.tag}</span>
            <div>
              <h3>
                {layer.title} <em>{layer.budget}</em>
              </h3>
              <p>{layer.body}</p>
            </div>
          </div>
        ))}
      </div>
      <h3 className="sub-heading">An excerpt from a real run</h3>
      <Code>{artifactSample}</Code>
      <h3 className="sub-heading">
        <code>--out .sctxx/</code> writes five files
      </h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>What it is</th>
            </tr>
          </thead>
          <tbody>
            {artifactFiles.map(([file, meaning]) => (
              <tr key={file}>
                <td>
                  <code>{file}</code>
                </td>
                <td>{meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Backends() {
  return (
    <div className="backend-list">
      {backends.map((backend) => (
        <div
          className={backend.recommended ? "backend recommended" : "backend"}
          key={backend.flag}
        >
          <div className="backend-head">
            <code>{backend.flag}</code>
            <span>{backend.needs}</span>
          </div>
          <p>{backend.body}</p>
        </div>
      ))}
    </div>
  );
}

function Commands() {
  return (
    <div className="command-list">
      {commands.map((command) => (
        <article className="card command-card" key={command.name}>
          <h3>
            <code>{command.name}</code>
          </h3>
          <p>{command.summary}</p>
          <dl>
            {command.flags.map(([flag, meaning]) => (
              <div key={flag}>
                <dt>
                  <code>{flag}</code>
                </dt>
                <dd>{meaning}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </div>
  );
}

function Workflows() {
  return (
    <div className="workflow-list">
      {workflows.map((workflow) => (
        <div className="workflow" key={workflow.title}>
          <h3>{workflow.title}</h3>
          <p>{workflow.body}</p>
          <Code>{workflow.code}</Code>
        </div>
      ))}
    </div>
  );
}

function Faq() {
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Exit</th>
              <th>Meaning</th>
              <th>What to do</th>
            </tr>
          </thead>
          <tbody>
            {exitCodes.map(([code, meaning, action]) => (
              <tr key={code}>
                <td>
                  <code>{code}</code>
                </td>
                <td>{meaning}</td>
                <td>{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="faq-list">
        {faqs.map((faq) => (
          <details key={faq.q}>
            <summary>{faq.q}</summary>
            <p>{faq.a}</p>
          </details>
        ))}
      </div>
    </>
  );
}

function SectionBody({ section }) {
  switch (section.kind) {
    case "cards":
      return <Cards cards={section.cards} />;
    case "steps":
      return <Steps steps={section.steps} />;
    case "prompts":
      return <Prompts prompts={section.prompts} />;
    case "reference":
      return <ReferenceSection />;
    case "artifact":
      return <ArtifactSection />;
    case "architecture":
      return <ArchitectureSection />;
    case "backends":
      return <Backends />;
    case "commands":
      return <Commands />;
    case "workflows":
      return <Workflows />;
    case "faq":
      return <Faq />;
    default:
      return null;
  }
}

/** Does this section match the search query? */
function matches(section, query) {
  if (!query) return true;
  const needle = query.toLowerCase();
  const haystack = [
    section.title,
    section.lead,
    section.text,
    JSON.stringify(section.cards ?? section.steps ?? section.prompts ?? ""),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

/** Sun, moon, and a half-filled circle: the three answers to "which theme?". */
function ThemeIcon({ name }) {
  const base = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    "aria-hidden": "true",
    focusable: "false",
  };
  if (name === "light") {
    return (
      <svg {...base} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 1.8v2.4M12 19.8v2.4M1.8 12h2.4M19.8 12h2.4M4.8 4.8l1.7 1.7M17.5 17.5l1.7 1.7M19.2 4.8l-1.7 1.7M6.5 17.5l-1.7 1.7" />
      </svg>
    );
  }
  if (name === "dark") {
    return (
      <svg {...base} fill="currentColor">
        <path d="M20.5 13.2A8.6 8.6 0 1 1 10.8 3.5a6.8 6.8 0 0 0 9.7 9.7z" />
      </svg>
    );
  }
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 3.2a8.8 8.8 0 0 0 0 17.6z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Light · Dark · Auto, as a segmented control in the top bar. */
function ThemeSwitch({ preference, onChange }) {
  return (
    <div className="theme-switch" role="group" aria-label="Colour theme">
      {[
        ["light", "Light"],
        ["dark", "Dark"],
        ["auto", "Match your system"],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          className="theme-option"
          aria-pressed={preference === value}
          aria-label={label}
          title={label}
          onClick={() => onChange(value)}
        >
          <ThemeIcon name={value} />
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(readPreference);

  const visible = useMemo(
    () => sections.filter((section) => matches(section, query)),
    [query],
  );

  // Apply the preference, and while it is `auto`, keep following the OS as the
  // reader's machine switches appearance. index.html resolves the same rule
  // before the first paint; this effect covers everything after.
  useEffect(() => {
    apply(theme);
    if (theme !== "auto") return undefined;
    return watchSystem(() => apply("auto"));
  }, [theme]);

  // Cmd/Ctrl-K focuses search; Escape clears it.
  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        document.getElementById("docsearch")?.focus();
      }
      if (event.key === "Escape") setQuery("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <a className="brand" href="#top">
            <span className="brand-mark">sx</span>
            <span>sctxx</span>
            <span className="version">v{VERSION}</span>
          </a>
          <nav className="top-links">
            <a href="#quickstart">Quick start</a>
            <a href="#prompts">Prompts</a>
            <a href="#commands">Commands</a>
            <a href="#troubleshooting">Troubleshooting</a>
          </nav>
          <div className="top-actions">
            <ThemeSwitch preference={theme} onChange={setTheme} />
            <label className="search compact-search">
              <span>⌕</span>
              <input
                id="docsearch"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search docs…"
                aria-label="Search documentation"
              />
              <kbd>⌘K</kbd>
            </label>
            <a
              className="button button-dark hide-mobile"
              href={REPO}
              target="_blank"
              rel="noreferrer"
            >
              GitHub ↗
            </a>
            <button
              className="menu-button"
              onClick={() => setMenuOpen((open) => !open)}
              type="button"
              aria-label="Menu"
            >
              ☰
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="mobile-search">
            <label className="search">
              <span>⌕</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search docs…"
              />
            </label>
            {sections.map((section) => (
              <a key={section.id} href={`#${section.id}`} onClick={() => setMenuOpen(false)}>
                {section.title}
              </a>
            ))}
          </div>
        )}
      </header>

      <div className="layout wrap" id="top">
        <aside className="sidebar">
          <div className="side-group">
            <div className="side-label">Documentation</div>
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={query && !matches(section, query) ? "dimmed" : undefined}
              >
                {section.title}
              </a>
            ))}
          </div>
          <div className="side-group">
            <div className="side-label">Elsewhere</div>
            <a href={REPO} target="_blank" rel="noreferrer">
              Source ↗
            </a>
            <a href={CRATE} target="_blank" rel="noreferrer">
              crates.io ↗
            </a>
            <a href={`${REPO}/releases`} target="_blank" rel="noreferrer">
              Releases ↗
            </a>
          </div>
          <div className="side-meta">
            <a href={REPO}>handyutils/sctxx</a>
            <span>Apache-2.0</span>
          </div>
        </aside>

        <main className="content">
          <section className="hero">
            <div className="eyebrow">{hero.eyebrow}</div>
            <h1>
              {hero.title[0]}
              <br />
              {hero.title[1]}
              <br />
              <em>{hero.title[2]}</em>
            </h1>
            <p>{hero.lead}</p>
            <div className="hero-actions">
              <a className="button button-light" href="#quickstart">
                Get started →
              </a>
              <a className="button button-ghost" href={REPO} target="_blank" rel="noreferrer">
                View source
              </a>
            </div>
            <div className="hero-grid">
              {hero.facts.map((fact) => (
                <div key={fact.label}>
                  <span>{fact.label}</span>
                  <code>{fact.value}</code>
                </div>
              ))}
            </div>
          </section>

          <section className="proof">
            <div className="proof-side">
              <span className="proof-label">In</span>
              <strong>{proof.before}</strong>
            </div>
            <div className="proof-arrow">→</div>
            <div className="proof-side">
              <span className="proof-label">Out</span>
              <strong>{proof.after}</strong>
            </div>
            <div className="proof-time">{proof.time}</div>
            {proof.note && <p className="proof-note">{proof.note}</p>}
          </section>

          {query && (
            <div className="result-bar">
              <span>
                {visible.length} matching section{visible.length === 1 ? "" : "s"}
              </span>
              <button onClick={() => setQuery("")} type="button">
                Clear search
              </button>
            </div>
          )}

          {visible.map((section) => (
            <section className="doc-section" id={section.id} key={section.id}>
              <SectionHeading
                number={section.number}
                title={section.title}
                lead={section.lead}
              />
              <SectionBody section={section} />
            </section>
          ))}

          {query && visible.length === 0 && (
            <div className="empty">
              Nothing matched “{query}”. Try “session id”, “backend”, or “exit code”.
            </div>
          )}

          <section className="doc-section" id="provenance">
            <SectionHeading
              number="11"
              title="Licence and provenance"
              lead="What sctxx is built from, and what it is not."
            />
            <p className="note">
              sctxx is Apache-2.0. It includes code derived from{" "}
              <a href="https://github.com/openai/codex" target="_blank" rel="noreferrer">
                OpenAI Codex
              </a>{" "}
              (Apache-2.0) at commit <code>818f1cc</code>: UTF-8-safe truncation, secret
              redaction, tiered evidence budgeting, rollback-aware replay, and the{" "}
              <code>apply_patch</code> header grammar. Each ported file carries its attribution
              header, and <code>src/vendor/codex/README.md</code> is the manifest.
            </p>
            <p className="note">
              sctxx is not affiliated with or endorsed by OpenAI or Anthropic. The Claude Code
              adapter is clean-room: written from on-disk session files, public documentation, and
              contributed fixtures only.
            </p>
            <div className="link-grid">
              <a href={REPO} target="_blank" rel="noreferrer">
                <span>Source code</span>
                <strong>GitHub ↗</strong>
              </a>
              <a href={CRATE} target="_blank" rel="noreferrer">
                <span>Published package</span>
                <strong>crates.io ↗</strong>
              </a>
              <a href={`${REPO}/blob/main/docs/SCTXX-SPEC.md`} target="_blank" rel="noreferrer">
                <span>Architecture</span>
                <strong>Specification ↗</strong>
              </a>
            </div>
          </section>

          <footer>
            <span>
              © 2026 <a href={REPO}>handyutils/sctxx</a>
            </span>
            <span>Apache-2.0 · Rust · React · GitHub Pages</span>
          </footer>
        </main>
      </div>
    </>
  );
}
