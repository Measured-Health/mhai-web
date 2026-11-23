#!/usr/bin/env bash
# The live proxies' client address (deploy/README.md, "Live site"): the real
# deploy/compose.yml and compose.platform.yml, with an echo server standing in
# for each app, checked from the host (as the host's nginx connects) and from
# another container (as anything else on the network would).
#
#   - from the host, X-Real-IP is believed (the host's nginx sets it to the
#     browser's address) and X-Forwarded-Proto passes through;
#   - from the host without X-Real-IP, the app sees the bridge address, and
#     an X-Forwarded-For alone is ignored;
#   - from another container, any X-Real-IP or X-Forwarded-For is ignored:
#     the app sees that container's own address, and the proxy's own scheme.
#
# Needs Docker and sudo (the compose files mount the backend's seed file from
# /srv/mhai-backend, made here empty). For CI only: it creates and removes
# the network mhai-bff and the folder /srv/mhai-backend/secrets/bff. Synthetic
# addresses only (TEST-NET ranges).
#
#   bash scripts/it/live-proxy-test.sh
set -uo pipefail
repo=$(cd "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d)
failures=0
proxy_image=nginx:1.27.5-alpine

cleanup() {
  for p in "${projects[@]:-}"; do
    # shellcheck disable=SC2086
    [ -n "$p" ] && docker compose $p --profile live down -v --remove-orphans >/dev/null 2>&1
  done
  docker network rm mhai-bff >/dev/null 2>&1
  sudo rm -f /srv/mhai-backend/secrets/bff/nats-bff-clinical.nk /srv/mhai-backend/secrets/bff/nats-bff-platform.nk
  rm -rf "$work"
}
projects=()
trap cleanup EXIT

if [ -e /srv/mhai-backend ] && [ ! -e /srv/mhai-backend/.ci-live-proxy-test ]; then
  echo "/srv/mhai-backend exists and is not this test's: refusing (CI only)"; exit 1
fi
sudo mkdir -p /srv/mhai-backend/secrets/bff
sudo touch /srv/mhai-backend/.ci-live-proxy-test /srv/mhai-backend/secrets/bff/nats-bff-clinical.nk /srv/mhai-backend/secrets/bff/nats-bff-platform.nk
docker network create --internal mhai-bff >/dev/null
# compose.platform.yml requires the sample-data app's secret even when only
# the live profile starts; the test never starts that app.
export PLATFORM_SESSION_SECRET=unused

# The echo app: what the proxy sent it, one line.
cat > "$work/echo.conf" <<'NGINX'
server {
    listen 8080;
    location / {
        default_type text/plain;
        return 200 "$http_x_real_ip|$http_x_forwarded_for|$http_x_forwarded_proto\n";
    }
}
NGINX
cp "$repo/deploy/nginx/live-proxy.conf.template" "$work/live-proxy.conf.template"

check() { # name, got, want
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: got '$2', want '$3'"; failures=$((failures + 1)); fi
}

run_case() { # compose file, app service, host port
  local file=$1 app=$2 port=$3 dir="$work/$2"
  mkdir -p "$dir"
  cp "$repo/deploy/$file" "$dir/$file"
  cp "$work/live-proxy.conf.template" "$dir/live-proxy.conf.template"
  # The app is the echo server; everything else is the real file.
  cat > "$dir/override.yml" <<YAML
services:
  $app:
    image: $proxy_image
    healthcheck: { disable: true }
    volumes:
      - $work/echo.conf:/etc/nginx/conf.d/default.conf:ro
YAML
  local c="-f $dir/$file -f $dir/override.yml"
  projects+=("$c")
  # shellcheck disable=SC2086
  if ! docker compose $c --profile live up -d "$app" "$app-proxy" >/dev/null; then
    echo "FAIL $app: compose up"; failures=$((failures + 1)); return
  fi
  local ok=0
  for _ in $(seq 1 30); do
    curl -fs -o /dev/null "http://127.0.0.1:$port/" && { ok=1; break; }
    sleep 1
  done
  # shellcheck disable=SC2086
  [ "$ok" = 1 ] || { echo "FAIL $app: proxy never answered"; docker compose $c --profile live logs "$app-proxy"; failures=$((failures + 1)); return; }

  local net gw
  # shellcheck disable=SC2086
  net=$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$(docker compose $c --profile live ps -q "$app-proxy")" | awk '{print $1}')
  gw=$(docker network inspect -f '{{(index .IPAM.Config 0).Gateway}}' "$net")

  check "$app: host, X-Real-IP believed, https passed" \
    "$(curl -fs -H 'X-Real-IP: 198.51.100.7' -H 'X-Forwarded-Proto: https' "http://127.0.0.1:$port/")" \
    "198.51.100.7|198.51.100.7|https"
  check "$app: host, no X-Real-IP: the bridge address" \
    "$(curl -fs "http://127.0.0.1:$port/")" "$gw|$gw|"
  check "$app: host, X-Forwarded-For alone ignored" \
    "$(curl -fs -H 'X-Forwarded-For: 203.0.113.9' "http://127.0.0.1:$port/")" "$gw|$gw|"

  local peer peer_ip got
  peer="live-proxy-test-peer-$app"
  docker run -d --name "$peer" --network "$net" --entrypoint sleep "$proxy_image" 60 >/dev/null
  peer_ip=$(docker inspect -f "{{(index .NetworkSettings.Networks \"$net\").IPAddress}}" "$peer")
  got=$(docker exec "$peer" wget -qO- --header 'X-Real-IP: 198.51.100.8' --header 'X-Forwarded-For: 198.51.100.8' \
    --header 'X-Forwarded-Proto: https' "http://$app-proxy:8080/")
  docker rm -f "$peer" >/dev/null
  check "$app: another container's X-Real-IP ignored" "$got" "$peer_ip|$peer_ip|http"
}

run_case compose.yml web-live 8093
run_case compose.platform.yml platform-live 8094

[ "$failures" = 0 ] || { echo "$failures failure(s)"; exit 1; }
echo "all live proxy tests passed"
