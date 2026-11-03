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
repo=$(cd "$here/../.." && pwd)
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
  # Only a temporary password: the app does every first sign-in step.
  "$here/backend-stack.sh" user "$role" "$state/$file" >/dev/null || return 1
  # One build per app (the transport is read at run time, not build time).
  local build=""
  [ -n "${built[$app]:-}" ] && build="E2E_LIVE_SKIP_BUILD=1"
  built[$app]=1
  echo "== $app over $transport (through the loopback proxy)"
  # The live preview's own proxy config in front of the app's server, in
  # one network namespace: the browser reaches http://localhost:8080 (a
  # secure context, as through the SSH tunnel), and nginx sets X-Real-IP.
  local port=3200 proxy=${MHAI_IT_PROJECT:-mhai-it}-live-proxy
  [ "$app" = platform ] && port=3201
  docker rm -f "$proxy" >/dev/null 2>&1
  docker run -d --name "$proxy" --network "${MHAI_IT_PROJECT:-mhai-it}_default" \
    -e LIVE_UPSTREAM="127.0.0.1:$port" \
    -v "$repo/deploy/nginx/live-proxy.conf.template:/etc/nginx/templates/default.conf.template:ro" \
    nginx:1.27.5-alpine >/dev/null || return 1
  IN_CI_NETWORK="container:$proxy" timeout 1200 "$here/in-ci.sh" "export NEXT_TELEMETRY_DISABLED=1 BACKEND_TRANSPORT=$transport E2E_LIVE_USER_FILE=/state/$file E2E_LIVE_BASE_URL=http://localhost:8080 $build; npm run e2e:live -w @mhai/$app || { for f in apps/$app/test-results/*/error-context.md; do [ -f \"\$f\" ] && sed -E -n -e '/textbox/s/: .*/: [value hidden]/' -e 1,120p \"\$f\"; done; exit 1; }"
  local rc=$?
  docker rm -f "$proxy" >/dev/null 2>&1
  return $rc
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
