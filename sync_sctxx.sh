#!/usr/bin/env bash
# =============================================================================
# sync_sctxx.sh
#
# Sync the `sctxx` submodule of this repository with its upstream:
#
#     https://github.com/handyutils/sctxx
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

export SYNC_SUBMODULE="sctxx"
export SYNC_UPSTREAM_URL="${SYNC_UPSTREAM_URL:-https://github.com/handyutils/sctxx.git}"
export SYNC_BRANCH="${SYNC_BRANCH:-main}"
export SYNC_SCRIPT_NAME="sync_sctxx.sh"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${HERE}/scripts/sync_submodule.sh" "$@"
