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

The platform admin app runs as a second service, `platform`, in the same
compose file, behind its own nginx site with an IP allow list:

```
browser ──https──> nginx (host, allow list) ──> 127.0.0.1:8091 ──> platform container
```

The same workflow builds both images (`mhai-web` and `mhai-web-platform`),
pulls and restarts both services, and health-checks both. One-time setup on
the instance, after the demo setup above:

1. DNS: the `platforms.measured-health.org` A record points at the instance
   (already done).

2. Session secret. The platform server refuses to start without it, and the
   image never contains it:

   ```bash
   cd /srv/mhai-web
   echo "PLATFORM_SESSION_SECRET=$(openssl rand -base64 48)" | sudo tee -a .env >/dev/null
   sudo chown ubuntu:ubuntu .env && chmod 600 .env
   ```

3. Allow list. One `allow <ip>;` line per permitted address; the product
   owner maintains it. Everyone else gets 403.

   ```bash
   sudo tee /etc/nginx/mhai-platform-allow.conf <<'EOF2'
   allow 203.0.113.10;
   EOF2
   ```

4. nginx site. Test before reloading:

   ```bash
   # copy deploy/nginx/mhai-platform.conf to /etc/nginx/sites-available/mhai-platform
   sudo ln -s /etc/nginx/sites-available/mhai-platform /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```

5. TLS:

   ```bash
   sudo certbot --nginx -d platforms.measured-health.org -m <ops-email> --agree-tos
   sudo nginx -t && sudo systemctl reload nginx
   ```

   Then open `/etc/nginx/sites-available/mhai-platform` and confirm the
   `include /etc/nginx/mhai-platform-allow.conf;` and `deny all;` lines are in
   the `:443` block too. If they are not, add them and reload.

6. Check from an address that is not on the list: `curl -I
   https://platforms.measured-health.org/sign-in` must return 403.

Logs: `docker compose logs --tail=100 platform`. To change who can reach it,
edit the allow file, then `sudo nginx -t && sudo systemctl reload nginx`.

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
