#!/usr/bin/env bash
# The backend's smoke stack (mhai-multiagent: docker-compose.yml plus
# docker-compose.smoke.yml, stub pipeline) for the BFF's NATS integration
# and live e2e tests. Build server only (steven-reid), never a laptop and
# never the demo host.
#
#   scripts/it/backend-stack.sh up          start it, seed a synthetic hospital
#   scripts/it/backend-stack.sh user <clinician|platform_admin> <out.json> [--ready]
#                                           a fresh synthetic user (mode 600);
#                                           --ready: first password and terms done
#   scripts/it/backend-stack.sh stop-core | start-core
#   scripts/it/backend-stack.sh down        remove it, volumes included
#
# MHAI_BACKEND_DIR is a checkout of mhai-multiagent at the pinned commit
# (MHAI_BACKEND_REF, default below); the build server has no GitHub access,
# so the caller ships it there (git archive). The images mhai-core:local and
# mhai-intelligence:cpu must exist (the backend's boundary-smoke.sh builds
# them); this script never builds or prunes.
#
# Every secret is generated here, kept in mode-600 files under
# MHAI_IT_STATE, and never printed. Only ports and file paths are printed.
# Synthetic data only.
set -euo pipefail

MHAI_BACKEND_REF=${MHAI_BACKEND_REF:-f0d1aa3}
backend=${MHAI_BACKEND_DIR:-$HOME/claude-work/mhai-it-backend}
state=${MHAI_IT_STATE:-$HOME/claude-work/mhai-it-state}
project=${MHAI_IT_PROJECT:-mhai-it}
nats_port=${MHAI_IT_NATS_PORT:-14222}
core_port=${MHAI_IT_CORE_PORT:-18092}
pg_port=${MHAI_IT_PG_PORT:-15432}
hospital=HIT

umask 077
compose() {
  docker compose -p "$project" --env-file "$state/env" \
    -f "$backend/docker-compose.yml" -f "$backend/docker-compose.smoke.yml" "$@"
}
secret() { printf 'k%s' "$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"; }

up() {
  [ -f "$backend/docker-compose.smoke.yml" ] || { echo "no backend checkout at $backend" >&2; exit 2; }
  if [ -f "$backend/.mhai-ref" ] && [ "$(cat "$backend/.mhai-ref")" != "$MHAI_BACKEND_REF" ]; then
    echo "backend checkout is not at $MHAI_BACKEND_REF" >&2; exit 2
  fi
  mkdir -p "$state"; chmod 700 "$state"
  if [ ! -f "$state/env" ]; then
    local bff_clinical bff_platform svc
    bff_clinical=$(secret); bff_platform=$(secret); svc=$(secret)
    cat > "$state/env" <<ENV
POSTGRES_DB=mhai
POSTGRES_USER=mhai
POSTGRES_PASSWORD=$(secret)
POSTGRES_PORT=$pg_port
NATS_PORT=$nats_port
CORE_PORT=$core_port
CORE_DB_PASSWORD=$(secret)
PROVISION_DB_PASSWORD=$(secret)
INTELLIGENCE_DB_PASSWORD=$(secret)
MFA_ENCRYPTION_KEY=$(secret)
BFF_SERVICE_KEYS=$svc
NATS_GATEWAY_PASSWORD=$(secret)
NATS_PIPELINE_PASSWORD=$(secret)
NATS_ECHO_PASSWORD=$(secret)
NATS_BFF_CLINICAL_PASSWORD=$bff_clinical
NATS_BFF_PLATFORM_PASSWORD=$bff_platform
NATS_JS_KEY=$(secret)$(secret)
ENV
    printf '%s' "$bff_clinical" > "$state/bff_clinical.pass"
    printf '%s' "$bff_platform" > "$state/bff_platform.pass"
    printf '%s' "$svc" > "$state/service.key"
    chmod 600 "$state"/*
  fi
  compose config -q
  compose up -d --wait --wait-timeout 300 >/dev/null
  local ready=0
  for _ in $(seq 1 60); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$core_port/api/v1/readyz" || true)" = 200 ]; then
      ready=1; break
    fi
    sleep 2
  done
  [ "$ready" = 1 ] || { echo "core not ready after 120 s" >&2; compose logs --no-color --tail=40 core >&2; exit 1; }
  local pg_pw n
  pg_pw=$(grep '^POSTGRES_PASSWORD=' "$state/env" | cut -d= -f2)
  n=$(docker exec -e PGPASSWORD="$pg_pw" "$project-postgres-1" psql -U mhai -d mhai -tAc \
      "SELECT count(*) FROM hospitals WHERE short_code = '$hospital'")
  if [ "$n" = 0 ]; then
    compose run --rm --no-deps -T core-cli hospitals create --name "Synthetic Hospital HIT" \
      --short-code "$hospital" --time-zone UTC >/dev/null
  fi
  compose run --rm --no-deps -T core-cli hospitals activate "$hospital" >/dev/null
  echo "stack up: project $project"
  echo "  network:  ${project}_default (nats:4222, core:8080)"
  echo "  host:     nats 127.0.0.1:$nats_port, core 127.0.0.1:$core_port"
  echo "  secrets:  $state/bff_clinical.pass, $state/bff_platform.pass, $state/service.key"
}

user() {
  local role=${1:?role} out=${2:?out file} email pw
  email="it-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')@hit.example.test"
  pw="It-first-$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
  case "$role" in
    clinician)
      printf '%s\n' "$pw" | compose run --rm --no-deps -T core-cli users create --email "$email" \
        --name "Synthetic IT Clinician" --roles clinician --hospital "$hospital" >/dev/null ;;
    platform_admin)
      printf '%s\n' "$pw" | compose run --rm --no-deps -T core-cli users create --email "$email" \
        --name "Synthetic IT Admin" --roles platform_admin >/dev/null ;;
    *) echo "unknown role" >&2; exit 2 ;;
  esac
  local totp_secret=""
  if [ "${3:-}" = --ready ]; then
    # The first sign-in steps done through core's HTTP API (sign in, change
    # the temporary password, accept the terms, and for a platform admin set
    # up two-step), so the browser test starts signed-in-ready. The apps'
    # welcome flows can't do some of these against core yet (TODO.md: the
    # clinical password step sends no current password; the platform app
    # doesn't take core's enrolment-only session for a new admin).
    local audience=clinical second token code uri
    [ "$role" = platform_admin ] && audience=platform
    second="It-second-$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
    token=$(signin "$audience" "$email" "$pw")
    [ -n "$token" ] || { echo "user: sign-in failed" >&2; exit 1; }
    code=$(core_status "$audience" POST /auth/password "$token" \
      "$(jq -nc --arg c "$pw" --arg n "$second" '{current_password:$c,new_password:$n}')")
    [ "$code" = 204 ] || { echo "user: password change answered $code" >&2; exit 1; }
    pw=$second
    token=$(signin "$audience" "$email" "$pw")
    if [ "$role" = platform_admin ]; then
      # An enrolment-only session reaches enrol and verify, not the terms:
      # turn two-step on, then sign in again with a fresh code.
      uri=$(core_call "$audience" POST /auth/mfa/enroll "$token" '{}' | jq -r '.otpauth_uri // empty')
      totp_secret=$(python3 -c 'import sys,urllib.parse as u; print(u.parse_qs(u.urlparse(sys.argv[1]).query)["secret"][0])' "$uri")
      code=$(core_status "$audience" POST /auth/mfa/verify "$token" \
        "$(jq -nc --arg c "$(totp_now "$totp_secret")" '{code:$c}')")
      [ "$code" = 204 ] || { echo "user: two-step verify answered $code" >&2; exit 1; }
      sleep $(( 31 - $(date +%s) % 30 ))   # a code is good once: the next step's
      token=$(signin "$audience" "$email" "$pw" "$(totp_now "$totp_secret")")
    fi
    code=$(core_status "$audience" POST /auth/terms "$token" '{"version":"2026-10"}')
    [ "$code" = 204 ] || { echo "user: terms answered $code" >&2; exit 1; }
  fi
  jq -nc --arg e "$email" --arg p "$pw" --arg t "$totp_secret" \
    '{email:$e,password:$p} + (if $t == "" then {} else {totp_secret:$t} end)' > "$out"
  chmod 600 "$out"
  echo "user: $role -> $out"
}

# One call to core's HTTP API on the host port, as a BFF would make it.
core_args() { # audience method path token body
  # The service key goes in a mode-600 header file, never on a command line.
  [ -f "$state/service.header" ] || printf 'X-MHAI-Service: %s\n' "$(cat "$state/service.key")" > "$state/service.header"
  local args=(-s -X "$2" -H "Content-Type: application/json" -H "X-MHAI-Client-IP: 198.51.100.15"
    -H "X-MHAI-Audience: $1" -H "@$state/service.header")
  [ -n "$4" ] && args+=(-H "Authorization: Bearer $4")
  [ -n "$5" ] && args+=(--data "$5")
  printf '%s\0' "${args[@]}" "http://127.0.0.1:$core_port/api/v1$3"
}
core_call() { core_args "$@" | xargs -0 curl; }
# An access token: sign in, and when core asks for two-step, answer with the
# code given, or with none for an account without two-step (core's
# enrolment-only session).
signin() { # audience email password [code]
  local r mfa
  r=$(core_call "$1" POST /auth/login "" "$(jq -nc --arg u "$2" --arg p "$3" '{username:$u,password:$p}')")
  mfa=$(printf '%s' "$r" | jq -r '.mfa_token // empty')
  if [ -n "$mfa" ]; then
    r=$(core_call "$1" POST /auth/mfa/challenge "" "$(jq -nc --arg t "$mfa" --arg c "${4:-}" '{mfa_token:$t,code:$c}')")
  fi
  printf '%s' "$r" | jq -r '.access_token // empty'
}
totp_now() { # base32 secret → the current 6-digit code
  python3 - "$1" <<'PY'
import base64, hmac, struct, sys, time
s = sys.argv[1].upper(); s += "=" * (-len(s) % 8)
h = hmac.new(base64.b32decode(s), struct.pack(">Q", int(time.time()) // 30), "sha1").digest()
o = h[-1] & 15
print("%06d" % ((struct.unpack(">I", h[o:o + 4])[0] & 0x7FFFFFFF) % 1000000))
PY
}
core_status() { core_args "$@" | xargs -0 curl -o /dev/null -w '%{http_code}'; }

case "${1:-}" in
  up) up ;;
  user) shift; user "$@" ;;
  stop-core) compose stop core >/dev/null; echo "core stopped" ;;
  start-core) compose start core >/dev/null; echo "core started" ;;
  down)
    compose down -v --remove-orphans >/dev/null 2>&1 || true
    rm -rf "$state"
    echo "stack down" ;;
  *) echo "usage: $0 up|user <role> <out>|stop-core|start-core|down" >&2; exit 2 ;;
esac
