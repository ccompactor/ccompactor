# Developing

## One-time

```sh
git clone https://github.com/ccompactor/ccompactor && cd ccompactor
npm install          # npm workspaces; installs commander, ink, react
npm run link         # builds, then puts `ccompactor` on PATH pointing at this checkout
```

`npm run link` is what makes `ccompactor` mean *your working copy* rather than the published
release. Check it took:

```sh
readlink -f "$(which ccompactor)"
# …/ccompactor/packages/ccompactor/dist/cli.js
```

## The loop

```sh
npm run dev -- list --any-project          # build, then run with your args
npm run dev -- extract claude:last --llm none --out /tmp/try
npm run dev -- --tui
```

`npm run dev` builds first and then runs, so it is always correct and takes a few seconds. For a
faster loop, leave a watcher running in a second terminal:

```sh
npm run watch                              # tsc --watch, rebuilds on save
# then, in the terminal you are working in:
npm run ccompactor -- list --any-project
```

## Checks

```sh
npm test          # 23 tests, node:test against compiled output, no network
npm run typecheck
npm run build
```

## Trying it against real sessions

```sh
ccompactor doctor                          # which stores were found
ccompactor list --any-project              # 700+ sessions is normal if you have been busy
ccompactor extract claude:last --llm none --out /tmp/try
```

`--llm none` never touches the network and is the fastest way to see what the artifact looks like.
For the model-written summary:

```sh
export CCOMPACTOR_BASE_URL=https://api.deepseek.com CCOMPACTOR_API_KEY=...
ccompactor extract claude:last --llm api:compat/deepseek-v4-flash --out /tmp/try
```

## The TUI

```sh
npm run dev -- --tui
```

It needs a real terminal — under a pipe it exits with `Raw mode is not supported`. `/` searches,
`↑↓` moves, `enter` shows detail, `e` extracts, `h` shows the handoff command, `q` quits.

## Going back to the published release

```sh
npm run unlink       # removes the global link
npm i -g ccompactor  # the released one
```

## Releasing

See [RELEASING.md](RELEASING.md).
