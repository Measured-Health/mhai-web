# Demo deployment

The demo runs on the shared preview instance, next to the EMR
stack, behind the host's nginx:

```
browser ──https──> nginx (host) ──> 127.0.0.1:8090 ──> mhai-web container
```

Every merge to `main` that passes CI runs `.github/workflows/deploy.yml`:
build the arm64 image in GitHub (from `apps/clinical/Dockerfile`, with the
repository root as the build context), push it to
`ghcr.io/measured-health/mhai-web`, then SSH to the instance, pull, restart
and health-check. It never touches the EMR containers or nginx.

Security headers (CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`,
`Permissions-Policy` and `Strict-Transport-Security: max-age=31536000;
includeSubDomains`) come from each app's `proxy.ts`, on every page, so nginx
needs no header lines for them; the app leaves HSTS off for localhost.

## One-time setup on the instance

Run as `ubuntu`. The demo is at `demo.measured-health.org`; its DNS A
record must point at the instance's public IP.

1. Compose file:

   ```bash
   sudo mkdir -p /srv/mhai-web && sudo chown ubuntu:ubuntu /srv/mhai-web
   # copy deploy/compose.yml to /srv/mhai-web/compose.yml
   # the feedback folder, writable by the container's user (uid 1001) only
   sudo mkdir -p /srv/mhai-web/feedback
   sudo chown 1001:1001 /srv/mhai-web/feedback && sudo chmod 750 /srv/mhai-web/feedback
   ```

2. nginx site. Test before reloading: a bad config must never take the EMR
   down.

   ```bash
   # copy deploy/nginx/mhai-demo.conf to /etc/nginx/sites-available/mhai-demo
   sudo ln -s /etc/nginx/sites-available/mhai-demo /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```

3. TLS, once DNS resolves to the instance:

   ```bash
   sudo certbot --nginx -d demo.measured-health.org -m <ops-email> --agree-tos
   sudo nginx -t && sudo systemctl reload nginx
   ```

4. Deploy key: the instance's existing `ubuntu` key (`mh.pem`).

5. In the GitHub repository:
   - environment `preview` with secrets `DEPLOY_HOST`, `DEPLOY_USER`
     (`ubuntu`), `DEPLOY_SSH_KEY` (the private key) and
     `DEPLOY_HOST_FINGERPRINT` (below);
   - repository variable `DEPLOY_ENABLED=true`.

   `DEPLOY_HOST_FINGERPRINT` is the instance's SSH host key fingerprint.
   The deploy checks it, so nobody in between can pose as the instance and
   receive the GHCR token, and it refuses to run while the secret is
   missing. `appleboy/ssh-action` v1.2.5 compares the full `SHA256:...`
   string, and the key it is offered is the host's **ECDSA** key (its SSH
   library asks for ECDSA before Ed25519). On the instance:

   ```bash
   ssh-keygen -lf /etc/ssh/ssh_host_ecdsa_key.pub | awk '{print $2}'   # SHA256:...
   ```

   Check it matches what your machine sees
   (`ssh-keyscan -t ecdsa 3.239.87.6 2>/dev/null | ssh-keygen -lf -`), then
   `gh secret set DEPLOY_HOST_FINGERPRINT --env preview --repo Measured-Health/mhai-web --body 'SHA256:...'`.
   If the instance is rebuilt, its host keys change: update the secret, or
   the deploy fails with `ssh: host key fingerprint mismatch`.

Then run the workflow once by hand (Actions → Deploy demo → Run workflow).

## Platform admin app (platforms.measured-health.org)

The platform admin app runs as its own compose project, `mhai-web-platform`,
in its own folder, `/srv/mhai-web-platform`, behind its own nginx site with an
IP allow list:

```
browser ──https──> nginx (host, allow list) ──> 127.0.0.1:8091 ──> platform container
```

The same workflow builds both images (`mhai-web` and `mhai-web-platform`)
in separate jobs, so a failed platform build never stops the demo deploy.
It always deploys the demo first. It deploys the platform only if its image
built and `/srv/mhai-web-platform/.env` holds `PLATFORM_SESSION_SECRET`;
otherwise it prints why it skipped the platform and still passes, so the
demo never depends on this setup. One-time setup on the instance, after the demo setup
above:

1. DNS: the `platforms.measured-health.org` A record points at the instance
   (already done).

2. Folder, compose file and session secret. Compose refuses to start the
   platform without the secret (`${PLATFORM_SESSION_SECRET:?}` in
   `compose.platform.yml`), and the image never contains it. Run the secret
   line once: running it again would replace the secret and sign everyone out.

   ```bash
   sudo mkdir -p /srv/mhai-web-platform && sudo chown ubuntu:ubuntu /srv/mhai-web-platform
   # copy deploy/compose.platform.yml to /srv/mhai-web-platform/compose.platform.yml
   cd /srv/mhai-web-platform
   (umask 077; echo "PLATFORM_SESSION_SECRET=$(openssl rand -base64 48)" > .env)
   ls -l .env   # -rw------- ubuntu
   ```

3. Allow list: `/etc/nginx/mhai-platform-allow.conf`, one `allow <ip>;` line
   per permitted address (an IPv6 address needs its own line). The product
   owner maintains it; everyone else gets 403. Create it only if it does not
   exist, so re-running never wipes the owner's list. Replace the example
   address:

   ```bash
   sudo touch /etc/nginx/mhai-platform-allow.conf
   echo 'allow 203.0.113.10;' | sudo tee -a /etc/nginx/mhai-platform-allow.conf >/dev/null
   ```

4. nginx site. Test before reloading:

   ```bash
   sudo cp deploy/nginx/mhai-platform.conf /etc/nginx/sites-available/mhai-platform
   sudo ln -s /etc/nginx/sites-available/mhai-platform /etc/nginx/sites-enabled/
   sudo mkdir -p /var/www/html
   sudo nginx -t && sudo systemctl reload nginx
   ```

   On plain http the site serves only Let's Encrypt's challenge path
   (`/.well-known/acme-challenge/`) and redirects everything else to https.
   The app is never served over http: passwords and two-step codes would
   travel in clear, and browsers drop the Secure session cookie anyway.

5. TLS. certbot's check comes from addresses that are not on the list, so use
   the webroot method, which the open challenge path serves:

   ```bash
   sudo certbot certonly --webroot -w /var/www/html -d platforms.measured-health.org -m <ops-email> --agree-tos
   ```

   Then add this `:443` block to `/etc/nginx/sites-available/mhai-platform`,
   below the `:80` block (it holds the allow list; keep the `include` and
   `deny all;` lines):

   ```nginx
   server {
       listen 443 ssl;
       server_name platforms.measured-health.org;
       server_tokens off;

       ssl_certificate     /etc/letsencrypt/live/platforms.measured-health.org/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/platforms.measured-health.org/privkey.pem;

       access_log /var/log/nginx/mhai-platform.access.log;
       error_log  /var/log/nginx/mhai-platform.error.log;

       include /etc/nginx/mhai-platform-allow.conf;
       deny all;

       location / {
           proxy_pass http://127.0.0.1:8091;
           proxy_http_version 1.1;
           # The app compares a write request's Origin with Host: keep $host.
           proxy_set_header Host              $host;
           proxy_set_header X-Real-IP         $remote_addr;
           proxy_set_header X-Forwarded-For   $remote_addr;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_set_header X-Forwarded-Host  $host;
           proxy_read_timeout 60s;
       }

       # Browsers that have seen the site use https only, for a year.
       add_header Strict-Transport-Security "max-age=31536000" always;
       add_header X-Robots-Tag "noindex, nofollow" always;
       add_header X-Content-Type-Options "nosniff" always;
   }
   ```

   Then `sudo nginx -t && sudo systemctl reload nginx`.

6. Checks:
   - from an address that is not on the list,
     `curl -I https://platforms.measured-health.org/sign-in` returns 403;
   - from a listed address it returns 200, with a
     `Strict-Transport-Security` header;
   - `curl -I http://platforms.measured-health.org/sign-in` returns 301 to
     the https address.

Then run the deploy workflow by hand (Actions, Deploy demo, Run workflow), or
start it once on the instance:
`cd /srv/mhai-web-platform && docker compose -f compose.platform.yml up -d`.

Logs: `cd /srv/mhai-web-platform && docker compose -f compose.platform.yml logs --tail=100 platform`.
To change who can reach it, edit the allow file, then
`sudo nginx -t && sudo systemctl reload nginx`.

## Public demo in live mode

Since 16 Nov 2026 the public demo (`demo.measured-health.org`) runs **live**:
the clinical app, built with `USE_MOCK=false` and `DEMO=true` (image tag
`live-demo`), signs in and asks questions through its BFF, over NATS, to the
backend demo's core service on the same host, and the backend's **sample AI**
answers (mhai-multiagent `deploy/README.md`: a demo-only worker with stub
models, labelled sample output, synthetic data only, no cloud call). The
ribbon still says "Demo · sample data, not for clinical use".

```
browser ──https──> nginx (host) ──> 127.0.0.1:8090 ──> web (live-demo image) ──mhai-bff──> mhai-nats ──> core ──> sample AI worker
```

`deploy/compose.demo-live.yml` is an override of the public `web` service
(image, NATS settings, the clinical NATS seed as a secret, the session
secret, the network `mhai-bff`); the port, cap and feedback folder stay as
in `compose.yml`. The deploy workflow builds the `live-demo` image on every
green main run, copies the override to `/srv/mhai-web`, and runs
`docker compose -f compose.yml -f compose.demo-live.yml up -d web` when all
of these hold; otherwise it runs the sample-data demo exactly as before and
prints why:

- the repository variable `DEMO_MODE` is not `mock`;
- the `live-demo` image was built on this run;
- the backend's clinical NATS seed `/srv/mhai-backend/secrets/bff/nats-bff-clinical.nk`
  and the network `mhai-bff` exist (the backend's `setup-host.sh`);
- the backend has seeded the demo: `/srv/mhai-backend/demo/seeded` exists
  (mhai-multiagent's "Deploy backend demo" writes it after `core demo seed`).

It makes `DEMO_LIVE_SESSION_SECRET` (`openssl rand -base64 48`) in
`/srv/mhai-web/.env` (mode 600) once, if missing, and never prints it. The
health check is `/sign-in` 200 and `/api/health` 200 (connected to NATS) on
127.0.0.1:8090. If the live app isn't healthy, the workflow prints its logs
and **falls back to the sample-data demo on its own**, then checks that, so
the public demo never stays down.

**The client IP.** Core needs the visitor's IP for sign-in and its per-IP
counters. The app reads it from `X-Real-IP` (`TRUSTED_CLIENT_IP_HEADER`).
That is safe here only because the host's nginx (`nginx/mhai-demo.conf`)
overwrites `X-Real-IP` with `$remote_addr` on every request, and the
container's only port is on 127.0.0.1, so only the host's own processes
(nginx) can reach it. Never publish 8090 on another address, and keep the
`proxy_set_header X-Real-IP $remote_addr;` line in the site. Two caveats:
containers on `mhai-web_default` and `mhai-bff` (ours: core, nats, the
tunnel previews) can reach `web:8080` with any `X-Real-IP`; and a CDN or
proxy put in front of nginx would make every visitor one `$remote_addr`, so
one person could trip the per-address lock for all. The public `web` now
holds the `bff_clinical` NATS seed: code running in the app could use that
user's permissions (`api.v1.clinical` only).

### Back to sample data (the fallback)

One line, from any machine with the GitHub CLI:

```bash
gh variable set DEMO_MODE --repo Measured-Health/mhai-web --body mock && gh workflow run deploy.yml --repo Measured-Health/mhai-web --ref main
```

And back to live: `gh variable delete DEMO_MODE --repo Measured-Health/mhai-web && gh workflow run deploy.yml --repo Measured-Health/mhai-web --ref main`.
On the instance, without GitHub: `cd /srv/mhai-web && docker compose up -d web`
(the next deploy goes live again unless `DEMO_MODE=mock`).

### The demo accounts (demo values, published on purpose)

Seeded by the backend (`core demo seed`, mhai-multiagent) in the synthetic
hospital **Demo General Hospital** (`DEM`) and reset on every backend deploy.
The password and the two-step secret below are **demo values, not
secrets**: the sign-in page shows them, and they open only this synthetic
hospital. Never reuse them anywhere.

- Demo password: `Sample-demo-only-2026`
- Demo authenticator secret (base32): `MHAIDEMOSAMPLEONLYNOTASECRET2345`.
  The code page shows the current code, made in the browser from it.

| Account                 | Email                                     | Roles                     | What it shows                                                                            |
| ----------------------- | ----------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| Clinician               | `a.reyes@demo-hospital.example`           | clinician                 | two-step, demo code (the app asks every account for two-step)                            |
| Clinician with two-step | `mfa.okafor@demo-hospital.example`        | clinician                 | the code step (demo code)                                                                |
| New account             | `new.bello@demo-hospital.example`         | clinician                 | first sign-in steps (new password, terms)                                                |
| New hospital admin      | `newadmin.okoro@demo-hospital.example`    | hospital admin            | first sign-in steps, two-step set-up                                                     |
| Hospital admin          | `admin.nwosu@demo-hospital.example`       | hospital admin            | staff, settings, usage (two-step, demo code)                                             |
| Medical director        | `director.obi@demo-hospital.example`      | clinician, hospital admin | both sides (two-step, demo code)                                                         |
| Analyst                 | `analyst.adeyemi@demo-hospital.example`   | clinician, analyst        | two-step, demo code (Analysis is off, below)                                             |
| Platform admin          | `platform.bakare@measured-health.example` | platform admin            | not in the helper: its password and two-step secret are random and never published       |
| Locked account          | `locked.eze@demo-hospital.example`        | clinician                 | nobody knows its password: every try fails, the fifth locks it for the visitor's address |

The sign-in helper fills the email and the demo password (a wrong password
for the locked account). It exists only in builds with `DEMO=true` (or the
mock demo); production builds have neither flag, so it never renders there.
The constants are published demo values (they open only the synthetic demo
accounts); whether the minifier drops them from a production bundle has not
been checked.

**Analysis and named access stay off in the public demo.**
`ANALYSIS_SIGNED_OFF` and `NAMED_ACCESS_SIGNED_OFF` are the clinical,
privacy and legal sign-off gates for live use (README, "Analysis"), and
those sign-offs haven't been given; the demo hospital's backend switch alone
isn't that sign-off. So the live demo sets neither: the analyst signs in as
a clinician and sees no Analysis page (Analysis still shows on the
sample-data demo). Turn it on only with the sign-off.

### Shared accounts: known limits

- **Visitors share accounts.** Everyone signed in as the demo clinician
  sees the same consultation history, including other visitors' questions.
  The ribbon and the helper say so; never type patient details. The
  backend keeps them until it is reset.
- **A visitor can change a shared account** (its password on the Account
  page, or a "new" account's first password and two-step) until the next
  backend deploy reseeds it. If an account stops working, rerun the
  backend's deploy (mhai-multiagent: Actions, Deploy backend demo).
- **Two visitors in the same 30 seconds.** Core refuses a two-step code an
  account has already used, so the second visitor waits for the next code.
- **Lock-out.** Core's per-login sign-in ceiling counts failures across
  every address for an hour: someone who keeps failing on a shared account
  can lock it for everyone for up to an hour. The per-address lock (five
  tries, 15 minutes) is what the locked account shows.

### Screens in the live demo

From the live readers, the full live check (`docs/live-e2e.md`) and the
demo backend's settings (EMR off, no pipeline but the sample AI). To be
confirmed by the live Playwright run after each deploy.

| Screen                                                                                           | Live demo                                                                                                               |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Sign in, two-step code, first sign-in (password, two-step set-up, backup codes, terms), sign out | live                                                                                                                    |
| Ask (home), the answer with sources and safety checks                                            | live (the sample AI's labelled answer)                                                                                  |
| A consultation (`/c/<id>`), print                                                                | live                                                                                                                    |
| Review queue (`/review`), corrections, My feedback                                               | live (empty until someone corrects or flags an answer)                                                                  |
| Notifications, notification settings                                                             | live                                                                                                                    |
| Account (devices, password, two-step, backup codes)                                              | live                                                                                                                    |
| Help                                                                                             | static                                                                                                                  |
| Hospital admin: overview, staff, settings, activity, usage, review oversight                     | live; invites, removing a person, resets, reminders and reviewer assignment show "Not available yet" (core answers 501) |
| Hospital admin: alert settings                                                                   | live (records status shows no connection: EMR is off)                                                                   |
| Alerts (bell, inbox)                                                                             | live, empty: the EMR is off on the demo host, so no alert is raised                                                     |
| Hospital admin: patient matches, patient exclusions                                              | live, empty (no record connection: the EMR is off)                                                                      |
| Find patient by MRN (question form)                                                              | not available: core serves the lookup only with the EMR on (404), which the demo host doesn't run                       |
| Analysis, named access, clearance letters                                                        | off (sign-off gates above); no page                                                                                     |
| Hospital sign-on                                                                                 | unavailable over NATS                                                                                                   |

## Live preview over NATS

The platform app stays on sample data; the public demo runs live (above). Two more
containers, `web-live` and `platform-live`, run the same apps built for live
mode (image tag `live`, `USE_MOCK=false`) and reach core over NATS
(`BACKEND_TRANSPORT=nats`, docs/adr/0005). They are under the compose
profile `live`, with no nginx site: the team reaches them by SSH tunnel.
Each has a small loopback proxy in front (`web-live-proxy`,
`platform-live-proxy`: nginx, `deploy/nginx/live-proxy.conf.template`),
the only published port (`127.0.0.1:8093` and `:8094`); the app containers
publish nothing. The proxy overwrites `X-Real-IP` with the address that
connected, which the app passes to core as the client IP (core refuses
sign-in without one). So no browser can choose its own IP to get past the
per-IP sign-in counters; every tunnel user shares the proxy's view of the
connection (the Docker bridge address). The apps are the only containers on
the backend's internal network `mhai-bff` and the only ones holding a NATS
seed; the proxies are not on it.

```
laptop ──ssh -L──> 127.0.0.1:8093 ──> web-live-proxy (sets X-Real-IP) ──> web-live ──mhai-bff──> mhai-nats ──> core
```

**What it needs from the backend** (mhai-multiagent `deploy/setup-host.sh`,
merged in its PR #83): the `bff_clinical` and `bff_platform` NKey users, the
seed files `/srv/mhai-backend/secrets/bff/nats-bff-clinical.nk` and
`nats-bff-platform.nk` (mode 400, uid 1001 = the image's `nextjs` user), and
the network `mhai-bff`. Compose mounts the seed read-only at
`/run/secrets/`; it is never in `.env`, the environment, the image or a log.

### Turning it on (once, by an operator)

1. Copy the new `deploy/compose.yml` to `/srv/mhai-web/compose.yml` and
   `deploy/compose.platform.yml` to `/srv/mhai-web-platform/`. The public
   services in them are unchanged. Copy
   `deploy/nginx/live-proxy.conf.template` into both folders (the proxies
   mount it from there).
2. Add a session secret for each live app (never the public one's):

   ```bash
   printf 'WEB_LIVE_SESSION_SECRET=%s\n' "$(openssl rand -base64 48)" >> /srv/mhai-web/.env
   printf 'PLATFORM_LIVE_SESSION_SECRET=%s\n' "$(openssl rand -base64 48)" >> /srv/mhai-web-platform/.env
   chmod 600 /srv/mhai-web/.env /srv/mhai-web-platform/.env
   ```

3. Run **Deploy demo** by hand (Actions, `workflow_dispatch`, branch
   `main`). That run also builds the `live` images and, after the public
   apps, starts `web-live` and `platform-live` with their proxies if the
   secret, the seed file and the proxy template are there (it says why when it skips one, and a live failure never
   fails the public deploy).
4. Check, on the instance:

   ```bash
   curl -s http://127.0.0.1:8093/api/health   # through the proxy: {"status":"ok"} once connected to NATS
   curl -s http://127.0.0.1:8094/api/health
   cd /srv/mhai-web && docker compose --profile live logs --tail=50 web-live   # "nats: connected", no request content
   docker inspect mhai-web-web-live-1 --format '{{json .Config.Env}}' | grep -c SU   # 0: no seed in the environment
   ```

5. From a laptop: `ssh -N -L 8093:127.0.0.1:8093 ubuntu@<host>` (and
   `8094` for the platform app), then open `http://localhost:8093`. Sign in
   with a synthetic account made with core's CLI, ask a question (with no
   pipeline on the demo it queues and ends in the failed view at its
   deadline), sign out. Hospital sign-on is unavailable on NATS.

### Day to day

- Logs: `cd /srv/mhai-web && docker compose --profile live logs --tail=100 web-live`
- Stop (the rollback; nothing public depends on it):
  `docker compose --profile live stop web-live-proxy web-live`, and
  `cd /srv/mhai-web-platform && docker compose -f compose.platform.yml --profile live stop platform-live-proxy platform-live`.
- Run **one** container per live app: the BFF keeps each rotated refresh
  token's successor in memory, so a second instance would send core a
  rotated-out token and end the session (TODO.md, "A shared refresh store").
- Never publish the app containers' own ports: without the proxy in front,
  a browser's `X-Real-IP` would reach core as the client IP.
- A bad image: `WEB_LIVE_IMAGE=ghcr.io/measured-health/mhai-web:live-sha-<previous> docker compose --profile live up -d web-live`.
- **Seed rotation or a leaked seed:** stop the live containers, run the
  backend's `setup-host.sh --rotate-bff clinical` (or `platform`, or
  `all`), restart its `nats`, then start the live containers again. The
  seed file is replaced in place; nothing here changes.
- `BACKEND_TRANSPORT=http` (`WEB_LIVE_TRANSPORT=http`) is not a rollback on
  this host: no container can reach core over HTTP here, so the app answers 503. Stop the container instead.

## Day to day

- Read demo feedback (one JSON line per message: time, page, screen size,
  message, optional name or role):
  `sudo cat /srv/mhai-web/feedback/feedback.jsonl | jq .`
  It stays on the instance and goes nowhere else. Testers are asked not to
  type patient details, but treat it as possibly sensitive anyway.

- Logs: `cd /srv/mhai-web && docker compose logs --tail=100 web`
- Restart: `docker compose restart web`
- Take it down: `docker compose down`, remove the site link from
  `/etc/nginx/sites-enabled/`, then `sudo nginx -t && sudo systemctl reload nginx`.
