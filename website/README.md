# ccompactor documentation site

The site published at **<https://ccompactor.github.io/>**.

React + Vite, no framework beyond that: the whole site is one page, and the content lives in
`src/content.js` so docs can be edited without touching layout code.

```sh
npm install
npm run dev       # http://localhost:5173/
npm run build     # -> dist/
npm run preview
```

## Deployment

`.github/workflows/pages.yml` builds and deploys on every push to `main` that touches
`website/**`. Nothing is committed from `dist/`; it is built in CI.

`vite.config.js` sets `base: "/"` because the site is served as a GitHub Pages user site, at the
domain root. Publishing it from a repository subpath instead means changing that to `"/<repo>/"`.

## Editing the docs

| File | What it holds |
| --- | --- |
| `src/content.js` | every heading, paragraph, table, command, and example |
| `src/App.jsx` | layout and the section renderers |
| `src/styles.css` | the visual language: safety yellow on blacktop, hazard stripes, monospace for commands |
| `src/assets/img/ccompactor-logo.png` | the mark, used in the header, the hero, the footer, and as the favicon |

Each section carries a `text` field used by the search box, so add keywords there when you add a
section.

When the CLI changes, `src/content.js` and the skill payload under
`packages/ccompactor/skill/` both need updating — they are the two places that document flags.

### House style

Every factual claim on this site is true of the current build. The one number that is not
flattering — ccompactor's retrieval accuracy against its Rust sister project — is published in
the Benchmarks section, in a caution ribbon, on purpose. Do not soften it and do not remove it.
