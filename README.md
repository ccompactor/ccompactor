# oca

**OCA — Open Coding Agent.**

OCA is built on top of other open source agent which is
vendored into this repository as a git submodule. OCA tracks upstream  and
layers its own work on top, so the fork point is always explicit and reproducible.


---

## Repository layout

```
oca/
├── <REMOTE_CODING_AGENT_UPSTREAM_SUBMODULE>/          # git submodule of OSS coding agent
├── sync_upstream.sh     # pull the latest upstream openclaude into the submodule
├── .gitmodules          # submodule definition (upstream URL)
└── README.md
```

The submodule is pinned to an exact upstream commit. That commit — not a branch — is what
this repository records, so checkouts are deterministic.

---

## Getting started

Clone with submodules in one step:

```sh
git clone --recurse-submodules git@github.com:inboxxobni/oca.git
cd oca
```

Already cloned without submodules? Initialize it:

```sh
git submodule update --init --recursive
```

---

## Syncing with upstream

`sync_upstream.sh` fetches the OSS coding agent here,
moves the submodule to the tip of its default branch (`main`), and commits the new pin in
this repository.

```sh
./sync_upstream.sh              # fetch, update the submodule, commit the new pin
./sync_upstream.sh --dry-run    # show what would change, modify nothing
./sync_upstream.sh --push       # commit and push to origin in one go
```

Options:

| Flag | Description |
| --- | --- |
| `-b, --branch <name>` | Upstream branch to sync (default: `main`) |
| `-r, --remote <name>` | Remote name used inside the submodule (default: `upstream`) |
| `-n, --dry-run` | Show what would change; move and commit nothing |
| `-c, --no-commit` | Move the submodule but leave the pin staged, not committed |
| `-p, --push` | Push this repository to `origin` after committing |
| `-f, --force` | Discard local changes inside the submodule if needed |
| `-h, --help` | Show usage |

Environment overrides: `OCA_UPSTREAM_URL`, `OCA_UPSTREAM_BRANCH`, `OCA_SUBMODULE`,
`OCA_GIT_NAME`, `OCA_GIT_EMAIL`.

Typical flow:

```sh
./sync_upstream.sh --dry-run    # 1. see the incoming upstream commits
./sync_upstream.sh              # 2. take them and record the new pin
git push origin HEAD            # 3. share the pin (or use --push)
```

Commits produced by the script are attributed to **Alexander Musichen** and look like:

```
chore(submodule): sync OSScodingAgent to e2b021d8bbda (upstream/main)
```

### Working on top of the submodule

If you need to change something inside `openSourceCodingAgent`, prefer contributing it upstream and
pulling it back in with `sync_upstream.sh`. If a change must stay local, don't leave it
uncommitted in the submodule — the script refuses to move a dirty submodule unless you
pass `--force`, which discards those edits.

---

## Manual sync (no script)

```sh
git submodule update --init --recursive
git -C <oss_coding_agent> fetch upstream main
git -C <oss_coding_agent> checkout --detach upstream/main
git add .gitmodules <oss_coding_agent>
git -c user.name="Alexander Musichen" -c user.email=alex.musichen@gmail.com \
  commit -m "chore(submodule): sync <oss_coding_agent> to upstream/main"
```

---

## License

Upstream `<oss_coding_agent>` is distributed under its own license - see it there.

