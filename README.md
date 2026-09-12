# oca

**OCA — Open Coding Agent.**

OCA is built on top of other open source agent tooling, vendored into this repository as git
submodules. OCA tracks each upstream and layers its own work on top, so every fork point is
explicit and reproducible.

---

## Repository layout

```
oca/
├── openclaude/                 # submodule -> https://github.com/Gitlawb/openclaude
├── sctxx/                      # submodule -> https://github.com/handyutils/sctxx
├── sync_openclaude.sh          # sync the openclaude submodule from its upstream
├── sync_sctxx.sh               # sync the sctxx submodule from its upstream
├── scripts/
│   └── sync_submodule.sh       # shared engine used by both sync scripts
├── .gitmodules                 # submodule definitions (upstream URLs)
└── README.md
```

Each submodule is pinned to an exact upstream commit. That commit — not a branch — is what
this repository records, so checkouts are deterministic.

| Submodule | Upstream | Sync script |
| --- | --- | --- |
| `openclaude/` | [Gitlawb/openclaude](https://github.com/Gitlawb/openclaude) | `./sync_openclaude.sh` |
| `sctxx/` | [handyutils/sctxx](https://github.com/handyutils/sctxx) | `./sync_sctxx.sh` |

---

## Getting started

Clone with submodules in one step:

```sh
git clone --recurse-submodules git@github.com:ccompactor/ccompactor.git
cd ccompactor
```

Already cloned without submodules? Initialize them:

```sh
git submodule update --init --recursive
```

---

## Syncing with upstream

There is one script per submodule. Each one fetches its upstream, moves that submodule to the
tip of the upstream default branch (`main`), and commits the new pin in this repository.

```sh
./sync_openclaude.sh              # fetch openclaude, update the submodule, commit the new pin
./sync_openclaude.sh --dry-run    # show what would change, modify nothing
./sync_openclaude.sh --push       # commit and push to origin in one go

./sync_sctxx.sh                   # same, for sctxx
./sync_sctxx.sh --dry-run
./sync_sctxx.sh --push
```

Sync everything in one go:

```sh
./sync_openclaude.sh && ./sync_sctxx.sh
```

Both scripts share the same options:

| Flag | Description |
| --- | --- |
| `-b, --branch <name>` | Upstream branch to sync (default: `main`) |
| `-r, --remote <name>` | Remote name used inside the submodule (default: `upstream`) |
| `-n, --dry-run` | Show what would change; move and commit nothing |
| `-c, --no-commit` | Move the submodule but leave the pin staged, not committed |
| `-p, --push` | Push this repository to `origin` after committing |
| `-f, --force` | Discard local changes inside the submodule if needed |
| `-h, --help` | Show usage |

Environment overrides: `SYNC_UPSTREAM_URL`, `SYNC_BRANCH`, `SYNC_REMOTE`, `SYNC_GIT_NAME`,
`SYNC_GIT_EMAIL`.

Typical flow:

```sh
./sync_sctxx.sh --dry-run       # 1. see the incoming upstream commits
./sync_sctxx.sh                 # 2. take them and record the new pin
git push origin HEAD            # 3. share the pin (or use --push)
```

Commits produced by the scripts are attributed to **Alexander Musichen** and look like:

```
chore(submodule): sync sctxx to 37d60265877e (upstream/main)
```

### Working on top of a submodule

If you need to change something inside a submodule, prefer contributing it upstream and pulling
it back in with the matching sync script. If a change must stay local, don't leave it
uncommitted inside the submodule — the scripts refuse to move a dirty submodule unless you pass
`--force`, which discards those edits.

---

## Manual sync (no script)

```sh
git submodule update --init --recursive
git -C sctxx fetch upstream main
git -C sctxx checkout --detach upstream/main
git add .gitmodules sctxx
git -c user.name="Alexander Musichen" -c user.email=alex.musichen@gmail.com \
  commit -m "chore(submodule): sync sctxx to upstream/main"
```

---

## License

Each upstream submodule is distributed under its own license — see the `LICENSE` file inside
that submodule.
