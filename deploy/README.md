# Demo deployment

The sample-data demo runs on the shared preview instance, next to the EMR
stack, behind the host's nginx:

```
browser ──https──> nginx (host) ──> 127.0.0.1:8090 ──> mhai-web container
```

Every merge to `main` that passes CI runs `.github/workflows/deploy.yml`:
build the arm64 image in GitHub (from `apps/clinical/Dockerfile`, with the
repository root as the build context), push it to
`ghcr.io/measured-health/mhai-web`, then SSH to the instance, pull, restart
and health-check. It never touches the EMR containers or nginx.

## One-time setup on the instance

Run as `ubuntu`. The demo is at `demo.measured-health.org`; its DNS A
record must point at the instance (3.239.87.6).

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
     (`ubuntu`) and `DEPLOY_SSH_KEY` (the private key);
   - repository variable `DEPLOY_ENABLED=true`.

Then run the workflow once by hand (Actions → Deploy demo → Run workflow).

## Platform admin app (platforms.measured-health.org)

The platform admin app runs as its own compose project, `mhai-web-platform`,
in its own folder, `/srv/mhai-web-platform`, behind its own nginx site with an
IP allow list:

```
browser ──https──> nginx (host, allow list) ──> 127.0.0.1:8091 ──> platform container
```

The same workflow builds both images (`mhai-web` and `mhai-web-platform`).
It always deploys the demo first. It deploys the platform only if
`/srv/mhai-web-platform/.env` holds `PLATFORM_SESSION_SECRET`; otherwise it
prints "Platform not set up yet; skipped" and still passes, so the demo never
depends on this setup. One-time setup on the instance, after the demo setup
above:

1. DNS: the `platforms.measured-health.org` A record points at the instance
   (already done).

2. Folder, compose file and session secret. The platform server refuses to
   start without the secret, and the image never contains it. Run the secret
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

   The site lets Let's Encrypt's challenge path
   (`/.well-known/acme-challenge/`) through the allow list, and nothing else.

5. TLS. certbot's check comes from addresses that are not on the list, so use
   the webroot method, which the open challenge path serves:

   ```bash
   sudo certbot certonly --webroot -w /var/www/html -d platforms.measured-health.org -m <ops-email> --agree-tos
   ```

   Then add the `:443` block to `/etc/nginx/sites-available/mhai-platform`
   yourself: copy the `server` block, change `listen 80` to
   `listen 443 ssl`, add `ssl_certificate
   /etc/letsencrypt/live/platforms.measured-health.org/fullchain.pem;` and
   `ssl_certificate_key .../privkey.pem;`, and keep the
   `include /etc/nginx/mhai-platform-allow.conf;` and `deny all;` lines (and
   the challenge `location`) in it. Optionally make the `:80` block redirect to
   https, keeping the challenge `location`. Then
   `sudo nginx -t && sudo systemctl reload nginx`.

6. Checks:
   - from an address that is not on the list,
     `curl -I https://platforms.measured-health.org/sign-in` returns 403;
   - from a listed address it returns 200.

Then run the deploy workflow by hand (Actions, Deploy demo, Run workflow), or
start it once on the instance:
`cd /srv/mhai-web-platform && docker compose -f compose.platform.yml up -d`.

Logs: `cd /srv/mhai-web-platform && docker compose -f compose.platform.yml logs --tail=100 platform`.
To change who can reach it, edit the allow file, then
`sudo nginx -t && sudo systemctl reload nginx`.

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
