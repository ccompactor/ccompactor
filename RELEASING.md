# Releasing

Everything is automated except one thing, and this file says which.

## One-time setup

The `Release` workflow publishes to npm, which needs a token that is **not** gated behind a one-time
password. A normal "Publish" token is gated; CI cannot answer an OTP prompt.

Create an **Automation** token at <https://www.npmjs.com/settings/~/tokens> (type: *Automation* — it
bypasses 2FA by design and is meant for exactly this), then:

```sh
gh secret set NPM_TOKEN --repo ccompactor/ccompactor
```

Paste the token when prompted. That is the whole setup.

> Why not `npm publish` locally? It works, but it asks for a browser OTP every time, and a release
> that depends on someone being at a keyboard is a release that stops happening. CI with an
> automation token is the version that keeps working.

## Cutting a release

```sh
# 1. bump the version in packages/ccompactor/package.json, and add a CHANGELOG entry
# 2. tag and push
git tag v0.1.1 && git push origin v0.1.1
```

The tag starts three things, in this order:

1. **npm publish** first, because `npm i -g ccompactor` is the path most people take and it should
   not wait behind six cross-compiles. The job runs `packages/ccompactor/scripts/guard-vendor.mjs`
   before it publishes — that guard refuses to ship any upstream-derived code, and it is the reason
   the vendored directory cannot come back by accident.
2. **Standalone binaries**, cross-compiled with `bun build --compile` for macOS (arm64, x64), Linux
   (x64, arm64) and Windows (x64, arm64), plus a `.deb` for each Linux architecture built with
   `dpkg-deb`.
3. **Attach everything to the GitHub release.**

To rehearse without publishing anything, run the workflow manually with `dry_run` on: it builds every
binary and creates a *draft* release, and skips npm entirely.

## Publishing from a laptop, if you must

```sh
npm run build
cd packages/ccompactor
node scripts/guard-vendor.mjs     # must print "safe to publish"
npm publish --access public       # will prompt for an OTP
```

## The website

`ccompactor.github.io` lives in its own repository and deploys itself on push to `main`. It is not
built from this repository, so nothing here needs to change when the site changes.

## What the guard protects

`packages/ccompactor/scripts/guard-vendor.mjs` fails the publish if any file derived from Anthropic's
proprietary Claude Code CLI is present in `src/compact/vendor/` or `dist/compact/vendor/`. Both
directories are checked because `files` ships `dist/`, and a guard that only checked the source would
happily publish the build output. See [NOTICE](NOTICE).
