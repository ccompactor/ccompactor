import { useEffect, useMemo, useState } from "react";
// Vite resolves the logo to a hashed URL at build time, so the mark ships with
// the site rather than depending on a path that happens to be served.
import logo from "./assets/img/ccompactor-logo.png";
import { apply, readPreference, watchSystem } from "./theme.js";
import {
  NPM,
  REPO,
  SISTER,
  VERSION,
  artifactFiles,
  artifactSample,
  benchmarks,
  caution,
  commands,
  faqs,
  footer,
  hero,
  install,
  layers,
  pipeline,
  proof,
  references,
  sections,
  stores,
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

/** The tiny copy button in the hero's install one-liner. */
function CopyInline({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      () => setCopied(false),
    );
  };
  return (
    <button className="copy-inline" onClick={copy} type="button">
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

/** The logo, sized by the caller. Kept in one place so the alt text is one string. */
function Logo({ className }) {
  return (
    <img
      className={className}
      src={logo}
      alt="ccompactor: a hard-hat excavator crushing a session transcript into a small block"
      width="1024"
      height="1024"
      decoding="async"
    />
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

/** The caution ribbon: a hazard-striped band for the disclosure that has to be read. */
function CautionRibbon({ data }) {
  return (
    <aside className="ribbon" aria-label="Benchmark disclosure">
      <div className="ribbon-stripes" aria-hidden="true" />
      <div className="ribbon-body">
        <span className="ribbon-label">{data.label}</span>
        <h3>{data.title}</h3>
        <p>{data.body}</p>
        <a className="ribbon-link" href={data.href}>
          {data.linkText} →
        </a>
      </div>
    </aside>
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
          <span className="step-number">{String(index + 1).padStart(2, "0")}</span>
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

/**
 * Install methods, plus the session-reference grammar and the stores.
 *
 * Both tables used to live under "supported agents"; the reference grammar is
 * what a reader needs while typing a command, so it belongs next to the
 * install instructions that produced the command.
 */
function AgentsSection() {
  return (
    <>
      <h3 className="sub-heading">Naming a session</h3>
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
        Without an agent prefix every store is searched. If a reference matches more than one
        session, <code>ccompactor</code> exits <code>3</code> and prints the candidates as JSON on
        stdout, so a script can show them instead of guessing.
      </p>

      <h3 className="sub-heading">Where the files live</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Store</th>
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
 * The pipeline, drawn in markup rather than shipped as an image.
 *
 * Six stages, each labelled with who does the work — "deterministic" or
 * "opt-in" — because that distinction is the whole argument of the tool. The
 * caption carries what the picture cannot show.
 */
function PipelineSection() {
  return (
    <div className="pipeline">
      <div className="pipeline-in row-scroll">
        {pipeline.inbound.map((agent) => (
          <div className="pipeline-source" key={agent.name}>
            <strong>{agent.name}</strong>
            <code>{agent.path}</code>
          </div>
        ))}
      </div>

      <div className="pipeline-merge" aria-hidden="true">
        <span>▾</span>
        <span>▾</span>
        <span>▾</span>
      </div>

      <ol className="pipeline-stages">
        {pipeline.stages.map((stage) => (
          <li
            className={stage.who === "opt-in" ? "pipeline-stage opt-in" : "pipeline-stage"}
            key={stage.n}
          >
            <span className="stage-number">{stage.n}</span>
            <div>
              <h3>
                {stage.title} <em className="stage-who">{stage.who}</em>
              </h3>
              <p>{stage.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="pipeline-caption">{pipeline.caption}</p>
    </div>
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
        <code>--out .ccompactor</code> writes five files
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

/**
 * The benchmark section, including the column ccompactor loses.
 *
 * The verdict is a sentence, not a chart: a reader should not have to compute
 * "which number is bigger" from a bar.
 */
function BenchmarksSection() {
  return (
    <>
      <div className="verdict">
        <span className="verdict-tag">The verdict</span>
        <p>
          On the shared handoff benchmark, the Rust sister project is ahead of ccompactor — in the
          headline class and especially on deep questions. ccompactor's retrieval index tells a
          successor which ranges exist, and it is not yet good enough at it.
        </p>
      </div>

      <div className="score-grid">
        {benchmarks.headline.map(([label, ours, theirs]) => (
          <div className="score" key={label}>
            <span className="score-label">{label}</span>
            <div className="score-row">
              <div className="score-cell ours">
                <span>ccompactor</span>
                <strong>{ours}</strong>
              </div>
              <div className="score-cell theirs">
                <span>sctxx (Rust)</span>
                <strong>{theirs}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>

      <dl className="bench-meta">
        {benchmarks.meta.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <h3 className="sub-heading">The four arms</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Arm</th>
              <th>What the successor is given</th>
              <th>Why it is in the table</th>
            </tr>
          </thead>
          <tbody>
            {benchmarks.arms.map((row) => (
              <tr key={row.arm}>
                <td>
                  <code>{row.arm}</code>
                </td>
                <td>{row.what}</td>
                <td>{row.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card callout">
        <div className="card-kicker">Measured, then removed</div>
        <h3>{benchmarks.removed.title}</h3>
        <p>{benchmarks.removed.body}</p>
      </div>

      <h3 className="sub-heading">Reproduce it</h3>
      <Code>{benchmarks.reproduce}</Code>
      <p className="note">
        The benchmark is a port of the one shipped with the sister project, so the two tools'
        numbers are comparable. A benchmark you only win is not a benchmark — the losing number
        is on this page because removing it would make the winning one meaningless.
      </p>
    </>
  );
}

function Faq() {
  return (
    <div className="faq-list">
      {faqs.map((faq) => (
        <details key={faq.q}>
          <summary>{faq.q}</summary>
          <p>{faq.a}</p>
        </details>
      ))}
    </div>
  );
}

function InstallSection() {
  return (
    <div className="install-list">
      {install.methods.map((method) => (
        <div className="install" key={method.title}>
          <h3>{method.title}</h3>
          <p>{method.body}</p>
          <Code compact>{method.code}</Code>
        </div>
      ))}
    </div>
  );
}

function SectionBody({ section }) {
  switch (section.kind) {
    case "cards":
      return <Cards cards={section.cards} />;
    case "steps":
      return <Steps steps={section.steps} />;
    case "reference":
      return <AgentsSection />;
    case "commands":
      return <Commands />;
    case "architecture":
      return <PipelineSection />;
    case "artifact":
      return <ArtifactSection />;
    case "install":
      return <InstallSection />;
    case "benchmarks":
      return <BenchmarksSection />;
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
    JSON.stringify(section.cards ?? section.steps ?? ""),
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
      <a className="skip-link" href="#content">
        Skip to content
      </a>

      <div className="hazard-bar" aria-hidden="true" />

      <header className="topbar">
        <div className="wrap topbar-inner">
          <a className="brand" href="#top">
            <Logo className="brand-logo" />
            <span className="brand-name">ccompactor</span>
            <span className="version">v{VERSION}</span>
          </a>
          <nav className="top-links" aria-label="Primary">
            <a href="#install">Install</a>
            <a href="#quickstart">Quick start</a>
            <a href="#commands">Commands</a>
            <a href="#benchmarks">Benchmarks</a>
          </nav>
          <div className="top-actions">
            <ThemeSwitch preference={theme} onChange={setTheme} />
            <label className="search compact-search">
              <span aria-hidden="true">⌕</span>
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
              aria-expanded={menuOpen}
            >
              ☰
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="mobile-search">
            <label className="search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search docs…"
                aria-label="Search documentation"
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
            <div className="side-label">On this page</div>
            <a href="#install">Install</a>
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
            <a href={NPM} target="_blank" rel="noreferrer">
              npm ↗
            </a>
            <a href={`${REPO}/releases`} target="_blank" rel="noreferrer">
              Releases ↗
            </a>
            <a href={SISTER} target="_blank" rel="noreferrer">
              The Rust sister ↗
            </a>
          </div>
          <div className="side-meta">
            <a href={REPO}>ccompactor/ccompactor</a>
            <span>MIT · TypeScript</span>
          </div>
        </aside>

        <main className="content" id="content">
          <section className="hero">
            <div className="hero-main">
              <div className="eyebrow">{hero.eyebrow}</div>
              <h1>
                {hero.title[0]}
                <br />
                {hero.title[1]}
                <br />
                <em>{hero.title[2]}</em>
              </h1>
              <p className="hero-tagline">{hero.taglines[0]}</p>
              <p className="hero-lead">{hero.lead}</p>
              <div className="hero-actions">
                <a className="button button-yellow" href="#install">
                  Get started →
                </a>
                <a className="button button-ghost" href={REPO} target="_blank" rel="noreferrer">
                  View source
                </a>
              </div>
              <div className="hero-install">
                <span className="hero-install-label">Install</span>
                <code>{hero.install}</code>
                <CopyInline text={hero.install} />
              </div>
              <ul className="hero-taglines">
                {hero.taglines.slice(1).map((tagline) => (
                  <li key={tagline}>{tagline}</li>
                ))}
              </ul>
            </div>
            <div className="hero-art">
              <Logo className="hero-logo" />
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
            <div className="proof-arrow" aria-hidden="true">
              →
            </div>
            <div className="proof-side">
              <span className="proof-label">Out</span>
              <strong>{proof.after}</strong>
            </div>
            <div className="proof-time">{proof.time}</div>
            {proof.note && <p className="proof-note">{proof.note}</p>}
          </section>

          <CautionRibbon data={caution} />

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

          <section className="doc-section" id="install">
            <SectionHeading
              number="00"
              title="Install"
              lead="One command on a machine with Node, or a single binary on one without."
            />
            <InstallSection />
          </section>

          {visible.map((section) => (
            <section
              className={
                section.id === "quickstart"
                  ? "doc-section yellow-band"
                  : "doc-section"
              }
              id={section.id}
              key={section.id}
            >
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
              Nothing matched “{query}”. Try “extract”, “provenance”, or “benchmark”.
            </div>
          )}

          <section className="doc-section" id="does-not">
            <SectionHeading
              number="09"
              title="What it does not do"
              lead="The limits, stated before someone discovers them in production."
            />
            <div className="cards two-col">
              <article className="card">
                <div className="card-kicker">Not a live compactor</div>
                <h3>It does not replace /compact</h3>
                <p>
                  ccompactor reads finished sessions. It does not sit inside a running agent's
                  context window or shrink it as you go.
                </p>
              </article>
              <article className="card">
                <div className="card-kicker">Read-only on your data</div>
                <h3>It never mutates a transcript</h3>
                <p>
                  The agent stores are opened for reading only. The artifact is the single thing
                  ccompactor writes, and it writes it into your project.
                </p>
              </article>
              <article className="card">
                <div className="card-kicker">No parity claim</div>
                <h3>It is not bit-identical to Claude Code</h3>
                <p>
                  The nine-section compaction contract is implemented from its published
                  description. Behaviour agrees with its sister project; implementation does not,
                  and no Claude Code source is involved.
                </p>
              </article>
              <article className="card">
                <div className="card-kicker">Behind, in public</div>
                <h3>It loses one benchmark</h3>
                <p>
                  The handoff benchmark is run by both implementations and ccompactor is behind on
                  retrieval accuracy. The numbers and the reason are in{" "}
                  <a href="#benchmarks">Benchmarks</a>, not in a footnote.
                </p>
              </article>
            </div>
          </section>

          <section className="doc-section" id="provenance">
            <SectionHeading
              number="10"
              title="Licence and provenance"
              lead="What ccompactor is built from, and what it is not."
            />
            <p className="note">
              ccompactor's own code is <strong>MIT</strong>. It contains no code derived from
              Anthropic's Claude Code CLI and no code from any fork of it; the{" "}
              <a href={`${REPO}/blob/main/NOTICE`} target="_blank" rel="noreferrer">
                NOTICE
              </a>{" "}
              file records exactly what was removed and why, and the guard that stops it coming
              back.
            </p>
            <p className="note">
              The product framing — cross-agent handoff, provenance on every claim, a verify step,
              layered artifacts — follows the Rust sister project{" "}
              <a href={SISTER} target="_blank" rel="noreferrer">
                sctxx
              </a>{" "}
              by the same author. None of its code is used: the two agree on behaviour rather than
              implementation, the handoff benchmark is a port, and the comparison is published
              including the column where ccompactor is behind.
            </p>
            <p className="note">
              ccompactor is not affiliated with or endorsed by Anthropic or OpenAI. It is an
              independent tool that reads files those programs leave on your disk.
            </p>
            <div className="link-grid">
              <a href={REPO} target="_blank" rel="noreferrer">
                <span>Source code</span>
                <strong>GitHub ↗</strong>
              </a>
              <a href={NPM} target="_blank" rel="noreferrer">
                <span>Published package</span>
                <strong>npm ↗</strong>
              </a>
              <a href={SISTER} target="_blank" rel="noreferrer">
                <span>Same idea, in Rust</span>
                <strong>sctxx ↗</strong>
              </a>
            </div>
          </section>

          <footer className="site-footer">
            <div className="footer-brand">
              <Logo className="footer-logo" />
              <div>
                <strong>ccompactor</strong>
                <p>{footer.note}</p>
              </div>
            </div>
            <div className="footer-columns">
              {footer.columns.map((column) => (
                <div key={column.label}>
                  <span className="footer-label">{column.label}</span>
                  {column.links.map((link) => (
                    <a
                      key={link.text}
                      href={link.href}
                      {...(link.href.startsWith("#")
                        ? {}
                        : { target: "_blank", rel: "noreferrer" })}
                    >
                      {link.text}
                      {link.href.startsWith("#") ? "" : " ↗"}
                    </a>
                  ))}
                </div>
              ))}
            </div>
            <div className="footer-base">
              <span>© 2026 ccompactor contributors</span>
              <span>MIT · TypeScript · React · GitHub Pages</span>
            </div>
          </footer>
        </main>
      </div>
    </>
  );
}
