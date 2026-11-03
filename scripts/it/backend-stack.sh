#!/usr/bin/env bash
# The backend's smoke stack (mhai-multiagent: docker-compose.yml plus
# docker-compose.smoke.yml, stub pipeline) for the BFF's NATS integration
# and live e2e tests. Build server only (steven-reid), never a laptop and
# never the demo host.
#
#   scripts/it/backend-stack.sh up          start it, seed a synthetic hospital
#   scripts/it/backend-stack.sh user <clinician|platform_admin> <out.json>
#                                           a fresh synthetic user with a
#                                           temporary password (mode 600)
#   scripts/it/backend-stack.sh stop-core | start-core
#   scripts/it/backend-stack.sh down        remove it, volumes included
#
# MHAI_BACKEND_DIR is a checkout of mhai-multiagent at the pinned commit
# (MHAI_BACKEND_REF, default below); the build server has no GitHub access,
# so the caller ships it there (git archive). Core is built from that
# checkout under its own tag, mhai-core:it-<ref> (never the shared
# mhai-core:local), once per ref; mhai-intelligence:cpu must exist (the
# backend's boundary-smoke.sh builds it). Nothing is ever pruned.
#
# Every secret is generated here, kept in mode-600 files under
# MHAI_IT_STATE, and never printed. Only ports and file paths are printed.
# Synthetic data only.
set -euo pipefail

# At or after backend PR #87 (MFARequired.mfa_enrolled, openapi 1.4.0).
MHAI_BACKEND_REF=${MHAI_BACKEND_REF:-001eb93}
backend=${MHAI_BACKEND_DIR:-$HOME/claude-work/mhai-it-backend}
state=${MHAI_IT_STATE:-$HOME/claude-work/mhai-it-state}
project=${MHAI_IT_PROJECT:-mhai-it}
nats_port=${MHAI_IT_NATS_PORT:-14222}
core_port=${MHAI_IT_CORE_PORT:-18092}
pg_port=${MHAI_IT_PG_PORT:-15432}
hospital=HIT

umask 077
core_image="mhai-core:it-$MHAI_BACKEND_REF"
compose() {
  docker compose -p "$project" --env-file "$state/env" \
    -f "$backend/docker-compose.yml" -f "$backend/docker-compose.smoke.yml" \
    -f "$state/core-image.yml" "$@"
}

# Core at the pinned ref, under its own tag, for every service that runs it.
core_image_override() {
  if ! docker image inspect "$core_image" >/dev/null 2>&1; then
    echo "building $core_image" >&2
    docker build -q -t "$core_image" "$backend/services/core" >/dev/null
  fi
  {
    echo "services:"
    for svc in core-migrate core-keys core-request-key core core-cli; do
      printf '  %s:\n    image: %s\n' "$svc" "$core_image"
    done
  } > "$state/core-image.yml"
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
  core_image_override
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
  jq -nc --arg e "$email" --arg p "$pw" '{email:$e,password:$p}' > "$out"
  chmod 600 "$out"
  echo "user: $role -> $out"
}

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
