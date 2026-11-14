#!/usr/bin/env bash
# The full live stack, for the end-to-end check of both apps in live mode
# (no sample data): the backend's smoke stack (Postgres, NATS, core, the
# stub pipeline worker) plus the EMR service with a synthetic FHIR source,
# Patient Analysis's keys and demo cohort, and both web apps built with
# NEXT_PUBLIC_USE_MOCK=false, each talking to core over NATS behind the live
# preview's loopback proxy. Build server only (steven-reid); never a laptop,
# never CI's shared runners, never the demo host. Synthetic data only.
#
#   scripts/it/live-full.sh up        images, backend, seed, both apps
#   scripts/it/live-full.sh test [spec filter...]
#                                     the live Playwright suite (both apps)
#   scripts/it/live-full.sh down      remove everything it made, volumes too
#   scripts/it/live-full.sh all       up, test, down (the nightly check)
#
# MHAI_BACKEND_DIR is a checkout of mhai-multiagent (the build server has no
# GitHub access: the caller ships it, e.g. git archive). Every name it makes
# starts with LIVE_PREFIX (default `live-`): the compose project, its
# containers, networks and volumes, and the images it builds (tagged with the
# backend checkout's .mhai-ref). Private ports on 127.0.0.1 and private
# subnets (LIVE_SUBNET, a /16 prefix such as 10.247). Nothing is pruned.
#
# Every secret is generated here into LIVE_STATE (mode 700), never printed.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
prefix=${LIVE_PREFIX:-live-}
project=${prefix}e2e
backend=${MHAI_BACKEND_DIR:-$HOME/claude-work/mhai-live-be}
state=${LIVE_STATE:-$HOME/claude-work/mhai-live-state}
out=${LIVE_OUT:-$HOME/claude-work/mhai-live-out}
net=${LIVE_SUBNET:-10.247}
pg_port=${LIVE_PG_PORT:-25432}
nats_port=${LIVE_NATS_PORT:-24222}
core_port=${LIVE_CORE_PORT:-28092}
nm_volume=${LIVE_NODE_MODULES:-${prefix}web-nm}
ci_image=${LIVE_CI_IMAGE:-mhai-web-ci:pw1.64.1}
hospital=LIV
synth_name=fhir.synthetic.example
synth_ip=$net.3.10
ref=$(cat "$backend/.mhai-ref" 2>/dev/null || echo dev)
core_image=${prefix}mhai-core:$ref
emr_image=${prefix}mhai-emr:$ref
intel_image=${prefix}mhai-intelligence:$ref

umask 077
compose() {
  docker compose -p "$project" --env-file "$state/env" \
    -f "$backend/docker-compose.yml" -f "$backend/docker-compose.smoke.yml" \
    -f "$state/live.yml" --profile emr "$@"
}
secret() { printf 'k%s' "$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"; }
psql_q() { # sql
  docker exec -e PGPASSWORD="$(sed -n 's/^POSTGRES_PASSWORD=//p' "$state/env")" \
    "$project-postgres-1" psql -v ON_ERROR_STOP=1 -U mhai -d mhai -tAc "$1"
}
cli() { compose run --rm --no-deps -T core-cli "$@"; }

images() {
  [ -f "$backend/docker-compose.smoke.yml" ] || { echo "no backend checkout at $backend" >&2; exit 2; }
  docker image inspect "$core_image" >/dev/null 2>&1 ||
    docker build -q -t "$core_image" -f "$backend/services/core/Dockerfile" "$backend/services" >/dev/null
  docker image inspect "$emr_image" >/dev/null 2>&1 ||
    docker build -q -t "$emr_image" -f "$backend/services/emr/Dockerfile" "$backend/services" >/dev/null
  docker image inspect "$intel_image" >/dev/null 2>&1 ||
    docker build -q --build-arg TORCH=cpu -t "$intel_image" "$backend/services/intelligence" >/dev/null
  # The emr image's state folders (the secret store 0700, nothing else at /
  # changed owner), when the backend has the check.
  if [ -f "$backend/services/emr/scripts/image-check.sh" ]; then
    bash "$backend/services/emr/scripts/image-check.sh" "$emr_image"
  fi
  echo "images: $core_image $emr_image $intel_image"
}

write_env() {
  mkdir -p "$state" "$out"; chmod 700 "$state"
  [ -f "$state/env" ] && return
  local bff_clinical bff_platform
  bff_clinical=$(secret); bff_platform=$(secret)
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
EMR_DB_PASSWORD=$(secret)
MFA_ENCRYPTION_KEY=$(secret)
BFF_SERVICE_KEYS=$(secret)
NATS_GATEWAY_PASSWORD=$(secret)
NATS_PIPELINE_PASSWORD=$(secret)
NATS_ECHO_PASSWORD=$(secret)
NATS_BFF_CLINICAL_PASSWORD=$bff_clinical
NATS_BFF_PLATFORM_PASSWORD=$bff_platform
NATS_EMR_CONF=emr.conf
NATS_EMR_PASSWORD=$(secret)
NATS_JS_KEY=$(secret)$(secret)
SECURITY_CONTACT_NAME=Synthetic Live Security
SECURITY_CONTACT_EMAIL=security@live.example.test
CORE_EMR_ENABLED=true
EMR_BACKEND_SUBNET=$net.1.0/24
EGRESS_EMR_INTERNAL_CIDRS=$net.1.0/24,$net.2.0/24
ANALYSIS_REF_HMAC_KEY_FILE=/analysis-keys/ref_hmac
ANALYSIS_REF_ENC_KEY_FILE=/analysis-keys/ref_enc
ANALYSIS_DRILL_KEY_FILE=/analysis-keys/drill
ANALYSIS_NOTE_KEY_FILE=/analysis-keys/note
ENV
  printf '%s' "$bff_clinical" > "$state/bff_clinical.pass"
  printf '%s' "$bff_platform" > "$state/bff_platform.pass"
  chmod 600 "$state"/*
  # The web containers run as root in the CI image; the files stay 600.
}

# The override: our own images, fixed private subnets, EMR on with the
# synthetic FHIR source on the proxy's outside network (development's
# EGRESS_EMR_DEV_EXEMPT), and the keys core needs for EMR and Analysis.
write_override() {
  # A fresh critical result after the first sync's backfill (which is
  # historical by design and never alerts), when the backend's synth-fhir
  # has the option (mhai-multiagent: synth-fhir --late-critical).
  local late_flag=""
  if grep -q late-critical "$backend/services/emr/cmd/emr/synth.go" 2>/dev/null; then
    late_flag=", \"--late-critical\", \"${LIVE_LATE_CRITICAL:-2m}\""
  fi
  cat > "$state/live.yml" <<YML
services:
  core-migrate: { image: $core_image }
  core-keys: { image: $core_image }
  core-request-key: { image: $core_image }
  core-cli: { image: $core_image }
  core:
    image: $core_image
    environment:
      CORE_EMR_ENABLED: "true"
      CORE_EMR_SEAL_PUBLIC_KEY_PATH: /emr-pub/seal.pub
      CORE_IDEMPOTENCY_HMAC_KEY_PATH: /analysis-keys/idem
      CORE_EMR_CONNECTOR_TYPES: fhir_r4
    volumes:
      - emr-pub:/emr-pub:ro
    depends_on:
      emr-pub: { condition: service_completed_successfully }
  analysis-keys:
    command:
      - |
        set -e
        for k in ref_hmac ref_enc drill note idem; do
          [ -s "/keys/\$\$k" ] || head -c 32 /dev/urandom | base64 > "/keys/\$\$k"
        done
        chown 65532:65532 /keys/*
        chmod 0600 /keys/*
  # The emr service's sealing public key, where core reads it (public only).
  emr-pub:
    image: postgres:16.15-alpine
    profiles: ["emr"]
    restart: "no"
    user: "0:0"
    entrypoint: ["/bin/sh", "-c"]
    command: ["cp /emr-keys/seal-*.pub /emr-pub/seal.pub && chmod 0444 /emr-pub/seal.pub"]
    network_mode: none
    volumes:
      - emr-keys:/emr-keys:ro
      - emr-pub:/emr-pub
    depends_on:
      emr-keys: { condition: service_completed_successfully }
  pipeline: { image: $intel_image }
  echo: { image: $intel_image }
  emr-keys: { image: $emr_image }
  emr-proxy-key: { image: $emr_image }
  emr:
    image: $emr_image
    environment:
      EMR_RULE_SET_ACTIVE: "0-synthetic"
      EMR_RULE_SET_FILE: /rules/testdata/ruleset-0-synthetic.yaml
      EMR_CODES_DIR: /codes/testdata
      EMR_MAPS_DIR: /maps
      EMR_DEV_CA_FILE: /synth/ca.pem
    volumes:
      - synth:/synth:ro
    depends_on:
      synth-fhir: { condition: service_started }
  egress-emr:
    image: $emr_image
    environment:
      EGRESS_EMR_DEV_EXEMPT: $net.3.0/24
  # The synthetic FHIR R4 server (emr synth-fhir, development only):
  # synthetic patients, one with a critical potassium.
  synth-fhir:
    image: $emr_image
    profiles: ["emr"]
    user: "0:0"
    command: ["synth-fhir", "--addr", ":443", "--seed", "7", "--patients", "12",
              "--name", "$synth_name", "--out", "/synth"$late_flag]
    environment:
      APP_ENV: development
    volumes: [synth:/synth]
    networks:
      egress-emr:
        ipv4_address: $synth_ip
        aliases: [$synth_name]
    healthcheck:
      disable: true
volumes:
  emr-pub: {}
  synth: {}
networks:
  default:
    ipam: { config: [{ subnet: $net.0.0/24 }] }
  emr-proxy:
    ipam: { config: [{ subnet: $net.2.0/24 }] }
  egress-emr:
    internal: true
    ipam: { config: [{ subnet: $net.3.0/24 }] }
YML
}

wait_core() {
  for _ in $(seq 1 90); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$core_port/api/v1/readyz" || true)" = 200 ] && return 0
    sleep 2
  done
  echo "core not ready" >&2; compose logs --no-color --tail=60 core >&2; return 1
}

backend_up() {
  write_env; write_override
  compose config -q
  # The synthetic server has no health check: start it first, wait for its files.
  compose up -d synth-fhir >/dev/null
  for _ in $(seq 1 60); do compose logs synth-fhir 2>/dev/null | grep -q serving && break; sleep 1; done
  compose up -d --wait --wait-timeout 600 >/dev/null
  wait_core
  echo "backend up: project $project, core 127.0.0.1:$core_port"
}

# A user with a temporary password (the app does every first sign-in step).
user() { # name roles [hospital]
  local f="$state/users/$1.json" email pw
  [ -f "$f" ] && return
  mkdir -p "$state/users"
  email="$1-$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')@liv.example.test"
  pw="Live-first-$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
  printf '%s\n' "$pw" | cli users create --email "$email" --name "Synthetic $1" \
    --roles "$2" ${3:+--hospital "$3"} >/dev/null
  jq -nc --arg e "$email" --arg p "$pw" '{email:$e,password:$p}' > "$f"
}

seed() {
  local n hid sha
  n=$(psql_q "SELECT count(*) FROM hospitals WHERE short_code = '$hospital'")
  if [ "$n" = 0 ]; then
    cli hospitals create --name "Synthetic Live Hospital" --short-code "$hospital" \
      --time-zone UTC --demo >/dev/null
  fi
  cli hospitals activate "$hospital" >/dev/null
  hid=$(psql_q "SELECT id FROM hospitals WHERE short_code = '$hospital'")
  if [ ! -f "$state/analysis.seeded" ]; then
    cli analysis seed-demo "$hospital" --seed 7 --months 24 >/dev/null
    touch "$state/analysis.seeded"
  fi
  user clinician clinician "$hospital"
  user analyst clinician "$hospital"
  user hadmin hospital_admin "$hospital"
  user padmin platform_admin
  user auditor auditor
  # The rule set the emr service loaded, activated for the hospital (no
  # screen sets it yet: core's PUT /platform/hospitals/{id}/emr-rule-set).
  sha=$(compose run --rm --no-deps -T emr rules check /rules/testdata/ruleset-0-synthetic.yaml 2>/dev/null |
        grep -oE '[0-9a-f]{64}' | head -n1)
  [ -n "$sha" ] || { echo "no rule set hash" >&2; return 1; }
  psql_q "INSERT INTO emr_rule_set_activation (hospital_id, version, sha256)
          VALUES ('$hid', '0-synthetic', decode('$sha', 'hex'))
          ON CONFLICT (hospital_id) DO UPDATE SET version = '0-synthetic', sha256 = EXCLUDED.sha256" >/dev/null
  printf '%s' "$hid" > "$state/hospital.id"
  # What the platform spec types into the connection form.
  printf '%s' "$synth_name" > "$state/synth.name"
  printf '%s' "$net.3.0/24" > "$state/synth.cidr"
  docker cp "$project-synth-fhir-1:/synth/client.key" "$state/synth-client.key" >/dev/null
  chmod 600 "$state"/synth*
  echo "seeded: hospital $hospital, users clinician analyst hadmin padmin auditor, rule set 0-synthetic"
}

# Both apps built once for live mode, in the CI image.
build_apps() {
  docker run --rm --init -e CI=1 -e NEXT_TELEMETRY_DISABLED=1 -e NEXT_PUBLIC_USE_MOCK=false \
    -v "$repo:/work" -v "$nm_volume:/work/node_modules" -v "${prefix}npm-cache:/root/.npm" \
    -w /work "$ci_image" bash -c 'npm ci --no-audit --no-fund >/dev/null && npm run build >/dev/null'
}

app() { # name port natsuser passfile extra-env...
  local name=$1 port=$2 natsuser=$3 pass=$4; shift 4
  docker rm -f "$project-web-$name" >/dev/null 2>&1 || true
  docker run -d --name "$project-web-$name" --network "${project}_default" \
    -v "$repo:/work" -v "$nm_volume:/work/node_modules" -v "$state:/state:ro" \
    -e NEXT_TELEMETRY_DISABLED=1 -e NEXT_PUBLIC_USE_MOCK=false -e BACKEND_TRANSPORT=nats \
    -e MHAI_DEPLOY_ENV=development -e TRUSTED_CLIENT_IP_HEADER=x-real-ip \
    -e NATS_URL=nats://nats:4222 -e NATS_USER="$natsuser" -e NATS_PASSWORD_FILE="/state/$pass" \
    "$@" -w "/work/apps/$name" "$ci_image" npx next start -p "$port" >/dev/null
}

apps_up() {
  build_apps
  local s1 s2
  s1=$(od -An -N36 -tx1 /dev/urandom | tr -d ' \n'); s2=$(od -An -N36 -tx1 /dev/urandom | tr -d ' \n')
  app clinical 3200 bff_clinical bff_clinical.pass -e SESSION_SECRET="$s1" -e ANALYSIS_SIGNED_OFF=true
  app platform 3201 bff_platform bff_platform.pass -e PLATFORM_SESSION_SECRET="$s2"
  # One proxy, both apps: the browser shares its network, so each app is
  # http://localhost:<port> (a secure context), and nginx sets X-Real-IP.
  sed -e 's/listen 8080;/listen 8080;/' "$repo/deploy/nginx/live-proxy.conf.template" |
    sed "s|\${LIVE_UPSTREAM}|$project-web-clinical:3200|" > "$state/proxy.conf"
  sed -e 's/listen 8080;/listen 8081;/' "$repo/deploy/nginx/live-proxy.conf.template" |
    sed "s|\${LIVE_UPSTREAM}|$project-web-platform:3201|" >> "$state/proxy.conf"
  chmod 644 "$state/proxy.conf"
  docker rm -f "$project-proxy" >/dev/null 2>&1 || true
  docker run -d --name "$project-proxy" --network "${project}_default" \
    -v "$state/proxy.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.27.5-alpine >/dev/null
  for p in 8080 8081; do
    for _ in $(seq 1 60); do
      docker exec "$project-proxy" wget -q -O /dev/null "http://127.0.0.1:$p/api/health" 2>/dev/null && break
      sleep 2
    done
  done
  echo "apps up: clinical http://localhost:8080, platform http://localhost:8081 (in $project-proxy's network)"
}

# Playwright in the proxy's network namespace. LIVE_GREP narrows the run.
# The browser is the one the lockfile's Playwright wants, installed once
# into its own volume (the CI image carries only the version it was built
# with, and a Playwright bump would otherwise stop every spec).
run_pw() { # app project [args...]
  local app=$1; shift
  docker run --rm --init --ipc=host --network "container:$project-proxy" \
    -v "$repo:/work" -v "$nm_volume:/work/node_modules" -v "$state:/state" -v "$out:/out" \
    -e CI=1 -e LIVE_STATE=/state -e LIVE_OUT=/out -e LIVE_HOSPITAL="$hospital" \
    -e LIVE_DEBUG -e LIVE_DEBUG_PATHS -e LIVE_DEBUG_USER \
    -v "${prefix}pw-browsers:/root/.cache/ms-playwright" \
    -w "/work/apps/$app" "$ci_image" bash -c \
    'npx playwright install chromium >/dev/null && exec npx playwright test -c playwright.full.config.ts "$@"' \
    _ "$@"
}

grant_analyst() {
  local a h
  a=$(jq -r .email "$state/users/analyst.json"); h=$(jq -r .email "$state/users/hadmin.json")
  cli users roles "$a" --add analyst --by "$h" >/dev/null 2>&1 || true
}

run_tests() {
  local status=0
  mkdir -p "$out"
  # First sign-ins (two-step, terms) for every user; each run after reuses them.
  run_pw clinical --project=setup || status=1
  run_pw platform --project=setup || status=1
  grant_analyst
  # LIVE_APPS narrows the run (default: both, platform first: it makes the
  # EMR connection the clinical alerts come from).
  for app in ${LIVE_APPS:-platform clinical}; do
    run_pw "$app" --project=live "$@" || status=1
  done
  # After the clinical analysis spec: the platform's reveal of its list,
  # found by its audit entry's id (core sends the drill-down's entry bare
  # until its facts are agreed, so no type filter finds it yet).
  psql_q "SELECT coalesce(max(id), 0) FROM audit_log WHERE action = 'analysis.patients_viewed'" \
    > "$state/drill.audit-id" 2>/dev/null || true
  case " ${LIVE_APPS:-platform clinical} " in
    *" platform "*) run_pw platform --project=late "$@" || status=1 ;;
  esac
  return $status
}

down() {
  docker rm -f "$project-proxy" "$project-web-clinical" "$project-web-platform" >/dev/null 2>&1 || true
  [ -f "$state/live.yml" ] && compose --profile test down -v --remove-orphans >/dev/null 2>&1 || true
  docker volume rm "${prefix}pw-browsers" >/dev/null 2>&1 || true
  rm -rf "$state"
  echo "down: $project (images kept: $core_image $emr_image $intel_image)"
}

case "${1:-}" in
  up) images; backend_up; seed; apps_up ;;
  backend) images; backend_up; seed ;;
  apps) apps_up ;;
  seed) seed ;;
  test) shift; run_tests "$@" ;;
  down) down ;;
  # The smoke subset: every path spec; the page tour (00-tour) only with
  # LIVE_TOUR=1, since it also lists the pages core can't serve yet.
  all)
    trap down EXIT
    images; backend_up; seed; apps_up
    if [ "${LIVE_TOUR:-0}" = 1 ]; then run_tests; else run_tests --grep-invert "tour|debug"; fi ;;
  compose) shift; compose "$@" ;;
  *) echo "usage: $0 up|backend|apps|seed|test|down|all|compose ..." >&2; exit 2 ;;
esac
