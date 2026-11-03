#!/usr/bin/env bash
# Runs a command in the mhai-web-ci image on the backend stack's network
# (scripts/it/backend-stack.sh), with this checkout at /work and the stack's
# state folder read-only at /state. Build server only.
#
#   scripts/it/in-ci.sh '<command>'
#
# WORK (default: this checkout), NODE_MODULES_VOLUME (the checkout's
# node_modules volume, as .remote-run.sh names it), MHAI_IT_STATE and
# MHAI_IT_PROJECT as in backend-stack.sh. With MHAI_IT_DOCKER=1 the host's
# Docker socket is mounted and a static docker CLI fetched, for the test
# that stops and starts core (A13).
set -euo pipefail
work=${WORK:-$(cd "$(dirname "$0")/../.." && pwd)}
state=${MHAI_IT_STATE:-$HOME/claude-work/mhai-it-state}
project=${MHAI_IT_PROJECT:-mhai-it}
volume=${NODE_MODULES_VOLUME:?set NODE_MODULES_VOLUME}
docker_args=()
prelude=""
if [ "${MHAI_IT_DOCKER:-0}" = 1 ]; then
  docker_args=(-v /var/run/docker.sock:/var/run/docker.sock -e "MHAI_IT_CORE_CONTAINER=$project-core-1")
  prelude='curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-27.3.1.tgz | tar -xz -C /usr/local/bin --strip-components=1 docker/docker; '
fi
# IN_CI_NETWORK: another network, e.g. container:<proxy> to share the
# loopback proxy's network (e2e-live.sh).
exec docker run --rm --init --ipc=host --network "${IN_CI_NETWORK:-${project}_default}" \
  -v "$work:/work" -v "$volume:/work/node_modules" -v "$state:/state:ro" \
  -v mhai-web-npm-cache:/root/.npm \
  -e CI=1 -e MHAI_IT_NATS_URL=nats://nats:4222 -e MHAI_IT_CORE_URL=http://core:8080 \
  -e MHAI_IT_STATE=/state "${docker_args[@]}" \
  -w /work mhai-web-ci:pw1.64.1 bash -c "$prelude$1"
