#!/usr/bin/env bash
# The live e2e on both transports (Task 9 of the BFF over NATS plan): the
# backend's smoke stack up, each app built once for live mode, its live
# spec run with BACKEND_TRANSPORT=http and then nats (a fresh synthetic user
# per leg), the stack down. Build server only, from this checkout; exits
# non-zero if any leg fails.
#
#   NODE_MODULES_VOLUME=<volume> scripts/it/e2e-live.sh [--keep]
#
# --keep leaves the stack up (for the integration test, test:it).
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
state=${MHAI_IT_STATE:-$HOME/claude-work/mhai-it-state}
keep=${1:-}
status=0

cleanup() { [ "$keep" = --keep ] || "$here/backend-stack.sh" down; }
trap cleanup EXIT

"$here/backend-stack.sh" up || exit 1
mkdir -p "$state/users"

declare -A built
run() { # app transport role
  local app=$1 transport=$2 role=$3 file
  file="users/$app-$transport.json"
  "$here/backend-stack.sh" user "$role" "$state/$file" --ready >/dev/null || return 1
  # One build per app (the transport is read at run time, not build time).
  local build=""
  [ -n "${built[$app]:-}" ] && build="E2E_LIVE_SKIP_BUILD=1"
  built[$app]=1
  echo "== $app over $transport"
  timeout 1200 "$here/in-ci.sh" "export NEXT_TELEMETRY_DISABLED=1 BACKEND_TRANSPORT=$transport E2E_LIVE_USER_FILE=/state/$file $build; npm run e2e:live -w @mhai/$app || { for f in apps/$app/test-results/*/error-context.md; do [ -f \"\$f\" ] && sed -n 1,120p \"\$f\"; done; exit 1; }"
}

# E2E_LIVE_APPS and E2E_LIVE_TRANSPORTS narrow a run (default: all).
for app in ${E2E_LIVE_APPS:-clinical platform}; do
  role=clinician
  [ "$app" = platform ] && role=platform_admin
  for transport in ${E2E_LIVE_TRANSPORTS:-http nats}; do
    run "$app" "$transport" "$role" || { echo "!! $app over $transport failed"; status=1; }
  done
done
exit $status
