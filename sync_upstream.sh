#!/usr/bin/env bash
# =============================================================================
# sync_upstream.sh
#
# Sync the `openclaude` git submodule of this repository with its upstream
# source of truth:
#
#     https://github.com/Gitlawb/openclaude
#
# The script fetches the upstream branch, moves the submodule to the tip of
# that branch (detached HEAD, as submodules should be), and records the new
# pinned commit in this repository.
#
# Maintainer: musichen
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration (override with environment variables if needed)
# ---------------------------------------------------------------------------
UPSTREAM_URL="${OCA_UPSTREAM_URL:-https://github.com/Gitlawb/openclaude.git}"
SUBMODULE="${OCA_SUBMODULE:-openclaude}"
REMOTE_NAME="${OCA_UPSTREAM_REMOTE:-upstream}"
BRANCH="${OCA_UPSTREAM_BRANCH:-main}"
GIT_NAME="${OCA_GIT_NAME:-musichen}"
GIT_EMAIL="${OCA_GIT_EMAIL:-alex.musichen@gmail.com}"

# ---------------------------------------------------------------------------
# Runtime flags
# ---------------------------------------------------------------------------
DO_COMMIT=1
DO_PUSH=0
DRY_RUN=0
FORCE=0

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
	C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
	C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'
else
	C_RESET=''; C_BOLD=''; C_DIM=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''
fi

info()  { printf '%s\n' "${C_BLUE}==>${C_RESET} $*"; }
ok()    { printf '%s\n' "${C_GREEN}  ok${C_RESET} $*"; }
warn()  { printf '%s\n' "${C_YELLOW}  !!${C_RESET} $*" >&2; }
die()   { printf '%s\n' "${C_RED}error:${C_RESET} $*" >&2; exit 1; }

usage() {
	cat <<EOF
${C_BOLD}sync_upstream.sh${C_RESET} — sync the '${SUBMODULE}' submodule from ${UPSTREAM_URL}

Usage:
  ./sync_upstream.sh [options]

Options:
  -b, --branch <name>   Upstream branch to sync (default: ${BRANCH})
  -r, --remote <name>   Remote name used inside the submodule (default: ${REMOTE_NAME})
  -n, --dry-run         Show what would change; do not move or commit anything
  -c, --no-commit       Move the submodule but do not commit the new pin here
  -p, --push            Push this repository to origin after committing
  -f, --force           Discard local changes inside the submodule if needed
  -h, --help            Show this help

Environment overrides:
  OCA_UPSTREAM_URL      Upstream clone URL   (default: ${UPSTREAM_URL})
  OCA_UPSTREAM_BRANCH   Upstream branch      (default: ${BRANCH})
  OCA_SUBMODULE         Submodule path       (default: ${SUBMODULE})
  OCA_GIT_NAME          Commit author name   (default: ${GIT_NAME})
  OCA_GIT_EMAIL         Commit author email  (default: ${GIT_EMAIL})
EOF
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [ $# -gt 0 ]; do
	case "$1" in
		-b|--branch)   [ $# -ge 2 ] || die "$1 needs a value"; BRANCH="$2"; shift 2 ;;
		-r|--remote)   [ $# -ge 2 ] || die "$1 needs a value"; REMOTE_NAME="$2"; shift 2 ;;
		-n|--dry-run)  DRY_RUN=1; DO_COMMIT=0; shift ;;
		-c|--no-commit) DO_COMMIT=0; shift ;;
		-p|--push)     DO_PUSH=1; shift ;;
		-f|--force)    FORCE=1; shift ;;
		-h|--help)     usage; exit 0 ;;
		*)             usage >&2; die "unknown option: $1" ;;
	esac
done

# ---------------------------------------------------------------------------
# Locate the superproject (this script may be invoked from anywhere)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

git rev-parse --git-dir >/dev/null 2>&1 || die "not a git repository: $SCRIPT_DIR"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

git config -f .gitmodules --get-regexp '^submodule\..*\.path$' >/dev/null 2>&1 \
	|| die "no submodules declared in .gitmodules"
git config -f .gitmodules --get "submodule.${SUBMODULE}.path" >/dev/null 2>&1 \
	|| die "submodule '${SUBMODULE}' is not declared in .gitmodules"

info "Repository:   ${C_BOLD}${REPO_ROOT}${C_RESET}"
info "Submodule:    ${C_BOLD}${SUBMODULE}${C_RESET}"
info "Upstream:     ${C_BOLD}${UPSTREAM_URL}${C_RESET} (branch: ${BRANCH})"
[ "$DRY_RUN" -eq 1 ] && warn "dry run — nothing will be modified"

# ---------------------------------------------------------------------------
# 1. Make sure the submodule is present and initialized
# ---------------------------------------------------------------------------
info "Initializing submodule"
git submodule update --init --recursive -- "$SUBMODULE"
ok "submodule ready"

# ---------------------------------------------------------------------------
# 2. Point the submodule at the upstream remote and fetch
# ---------------------------------------------------------------------------
SUBMODULE_GIT=(git -C "$SUBMODULE")
[ -e "$SUBMODULE/.git" ] || die "submodule '${SUBMODULE}' has no git directory; run: git submodule update --init --recursive"

if "${SUBMODULE_GIT[@]}" remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
	"${SUBMODULE_GIT[@]}" remote set-url "$REMOTE_NAME" "$UPSTREAM_URL"
else
	"${SUBMODULE_GIT[@]}" remote add "$REMOTE_NAME" "$UPSTREAM_URL"
fi
ok "remote '${REMOTE_NAME}' -> ${UPSTREAM_URL}"

info "Fetching ${REMOTE_NAME}/${BRANCH}"
"${SUBMODULE_GIT[@]}" fetch --prune --tags "$REMOTE_NAME" \
	"+refs/heads/${BRANCH}:refs/remotes/${REMOTE_NAME}/${BRANCH}"

CURRENT="$("${SUBMODULE_GIT[@]}" rev-parse HEAD)"
PINNED="$(git rev-parse --verify --quiet "HEAD:${SUBMODULE}" || true)"
TARGET="$("${SUBMODULE_GIT[@]}" rev-parse "${REMOTE_NAME}/${BRANCH}")"

info "Current pin:  ${CURRENT:0:12}"
info "Upstream tip: ${TARGET:0:12}"

# ---------------------------------------------------------------------------
# 3. Already up to date?
# ---------------------------------------------------------------------------
if [ "$CURRENT" = "$TARGET" ] && [ "$PINNED" = "$TARGET" ] && [ "$FORCE" -eq 0 ]; then
	ok "already up to date with ${REMOTE_NAME}/${BRANCH} — nothing to do"
	exit 0
fi

if [ "$CURRENT" != "$TARGET" ]; then
	info "Incoming commits:"
	"${SUBMODULE_GIT[@]}" --no-pager log --oneline --no-decorate "${CURRENT}..${TARGET}" | sed 's/^/    /'
elif [ "$PINNED" != "$TARGET" ]; then
	if [ -z "$PINNED" ]; then
		warn "submodule is at ${TARGET:0:12} but this repository has not recorded a pin yet"
	else
		warn "submodule is at ${TARGET:0:12} but this repository still pins ${PINNED:0:12}"
	fi
fi

# ---------------------------------------------------------------------------
# 4. Move the submodule to the upstream tip (detached, like a proper pin)
# ---------------------------------------------------------------------------
if [ -n "$("${SUBMODULE_GIT[@]}" status --porcelain)" ]; then
	if [ "$FORCE" -eq 1 ]; then
		warn "discarding local changes inside '${SUBMODULE}' (--force)"
		"${SUBMODULE_GIT[@]}" reset --hard >/dev/null
		"${SUBMODULE_GIT[@]}" clean -fd >/dev/null
	else
		die "submodule '${SUBMODULE}' has local changes; commit/stash them or re-run with --force"
	fi
fi

if [ "$DRY_RUN" -eq 1 ]; then
	if [ "$CURRENT" = "$TARGET" ]; then
		info "dry run: submodule already at ${TARGET:0:12}; would record the pin in this repository"
	else
		info "dry run: would check out ${TARGET:0:12} and pin it in this repository"
	fi
	exit 0
fi

if [ "$CURRENT" != "$TARGET" ]; then
	"${SUBMODULE_GIT[@]}" checkout --detach "$TARGET" >/dev/null 2>&1 \
		|| "${SUBMODULE_GIT[@]}" checkout --detach --force "$TARGET" >/dev/null
	"${SUBMODULE_GIT[@]}" submodule update --init --recursive >/dev/null 2>&1 || true
	ok "submodule checked out at ${TARGET:0:12}"
fi

# ---------------------------------------------------------------------------
# 5. Stage the .gitmodules file and the new submodule pointer
# ---------------------------------------------------------------------------
git add .gitmodules "$SUBMODULE"

if [ "$DO_COMMIT" -eq 0 ]; then
	info "--no-commit set; staged changes:"
	git --no-pager diff --cached --submodule=short --stat | sed 's/^/    /'
	exit 0
fi

# ---------------------------------------------------------------------------
# 6. Commit the new pin (attributed to musichen)
# ---------------------------------------------------------------------------
STAGED="$(git diff --cached --name-only)"
if [ -z "$STAGED" ]; then
	ok "nothing staged — already up to date"
	exit 0
fi

SHORT="${TARGET:0:12}"
MSG="chore(submodule): sync ${SUBMODULE} to ${SHORT} (${REMOTE_NAME}/${BRANCH})"

git \
	-c "user.name=${GIT_NAME}" \
	-c "user.email=${GIT_EMAIL}" \
	commit --no-verify \
	-m "$MSG" \
	-m "Upstream: ${UPSTREAM_URL}" \
	-m "Branch:   ${BRANCH}" \
	-m "Commit:   ${TARGET}"
ok "committed as ${GIT_NAME}: $(git rev-parse --short HEAD) ${MSG}"

# ---------------------------------------------------------------------------
# 7. Optionally push
# ---------------------------------------------------------------------------
if [ "$DO_PUSH" -eq 1 ]; then
	UPSTREAM_BRANCH="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || echo '')"
	info "Pushing to origin${UPSTREAM_BRANCH:+ (${UPSTREAM_BRANCH})}"
	if [ -n "$UPSTREAM_BRANCH" ]; then
		git push origin HEAD
	else
		git push -u origin HEAD
	fi
	ok "pushed"
else
	info "Review the change, then push with:  git push origin HEAD   (or re-run with --push)"
fi
