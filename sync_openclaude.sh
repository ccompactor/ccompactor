#!/usr/bin/env bash
# =============================================================================
# sync_openclaude.sh
#
# Sync the `openclaude` submodule of this repository with its upstream:
#
#     https://github.com/Gitlawb/openclaude
#
# The script fetches the upstream branch, moves the submodule to the tip of
# that branch (detached HEAD, as submodules should be), and records the new
# pinned commit in this repository.
#
# Thin wrapper: all options live in scripts/sync_submodule.sh — run with --help.
#
# Maintainer: Alexander Musichen (musichen)
# =============================================================================

set -euo pipefail

export SYNC_SUBMODULE="openclaude"
export SYNC_UPSTREAM_URL="${SYNC_UPSTREAM_URL:-https://github.com/Gitlawb/openclaude.git}"
export SYNC_BRANCH="${SYNC_BRANCH:-main}"
export SYNC_SCRIPT_NAME="sync_openclaude.sh"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${HERE}/scripts/sync_submodule.sh" "$@"
