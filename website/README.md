# sctxx documentation site

The site published at **<https://handyutils.github.io/sctxx>**.

React + Vite, no framework beyond that: the whole site is one page, and the content lives in
`src/content.js` so docs can be edited without touching layout code.

```sh
npm install
npm run dev       # http://localhost:5173/sctxx/
npm run build     # -> dist/
npm run preview
```

## Deployment

`.github/workflows/pages.yml` builds and deploys on every push to `main` that touches
`website/**`. Nothing is committed from `dist/`; it is built in CI.

`vite.config.js` sets `base: "/sctxx/"` because GitHub Pages serves the site from a repository
subpath. Changing the repository name means changing that too.

## Editing the docs

| File | What it holds |
| --- | --- |
| `src/content.js` | every heading, paragraph, table, command, and example |
| `src/App.jsx` | layout and the section renderers |
| `src/styles.css` | the visual language shared with the other handyutils sites |

Each section carries a `text` field used by the search box, so add keywords there when you add a
section.

When the CLI changes, `src/content.js` and `skill/references/cli.md` both need updating — they
are the two places that document flags.
