# Demo deployment

The sample-data demo runs on the shared preview instance, next to the EMR
stack, behind the host's nginx:

```
browser ──https──> nginx (host) ──> 127.0.0.1:8090 ──> mhai-web container
```

Every merge to `main` that passes CI runs `.github/workflows/deploy.yml`:
build the arm64 image in GitHub, push it to
`ghcr.io/measured-health/mhai-web`, then SSH to the instance, pull, restart
and health-check. It never touches the EMR containers or nginx.

## One-time setup on the instance

Run as `ubuntu`. The demo is at `demo.measured-health.org`; its DNS A
record must point at the instance (3.239.87.6).

1. Compose file:

   ```bash
   sudo mkdir -p /srv/mhai-web && sudo chown ubuntu:ubuntu /srv/mhai-web
   # copy deploy/compose.yml to /srv/mhai-web/compose.yml
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

## Day to day

- Logs: `cd /srv/mhai-web && docker compose logs --tail=100 web`
- Restart: `docker compose restart web`
- Take it down: `docker compose down`, remove the site link from
  `/etc/nginx/sites-enabled/`, then `sudo nginx -t && sudo systemctl reload nginx`.
