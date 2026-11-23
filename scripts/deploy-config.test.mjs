import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The live site's config (deploy/README.md, "Live site"): the public nginx
// sites go to the live proxies on the ports the compose files publish, the
// proxies believe X-Real-IP only from the host, and the deploy never falls
// back to the demo or sample data in live mode. The proxies' behaviour
// itself is checked with Docker by scripts/it/live-proxy-test.sh (CI).
const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(root + p, "utf8");
// Directives only, without comments.
const directives = (text) =>
  text
    .split("\n")
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter(Boolean);

test("the live clinical site goes to web-live-proxy (8093) and overwrites the client address", () => {
  const d = directives(read("deploy/nginx/mhai-live.conf"));
  assert.ok(d.includes("server_name ai.measured-health.org;"));
  assert.deepEqual(
    d.filter((l) => l.startsWith("proxy_pass")),
    ["proxy_pass http://127.0.0.1:8093;"],
  );
  assert.ok(d.includes("proxy_set_header X-Real-IP         $remote_addr;"));
  assert.ok(d.includes("proxy_set_header X-Forwarded-For   $remote_addr;"));
  assert.ok(!d.some((l) => l.includes("$proxy_add_x_forwarded_for")));
});

test("the compose files publish the live proxies on 127.0.0.1:8093 and :8094 only", () => {
  const web = read("deploy/compose.yml");
  const plat = read("deploy/compose.platform.yml");
  assert.match(web, /web-live-proxy:[\s\S]*?- "127\.0\.0\.1:8093:8080"/);
  assert.match(plat, /platform-live-proxy:[\s\S]*?- "127\.0\.0\.1:8094:8080"/);
  for (const text of [web, plat]) {
    // Only loopback ports, anywhere.
    for (const m of text.matchAll(/^\s*- "([^"]*:\d+:\d+)"$/gm)) {
      assert.ok(m[1].startsWith("127.0.0.1:"), `port ${m[1]} is not loopback`);
    }
    // The proxy works out the host's address and refuses to start without it.
    assert.match(text, /export LIVE_TRUSTED_PROXY="\$\$gw"/);
    assert.match(text, /refusing to start/);
    assert.match(text, /exec \/docker-entrypoint\.sh nginx -g 'daemon off;'/);
  }
});

test("the live proxy believes X-Real-IP from the host's address only, one hop", () => {
  const d = directives(read("deploy/nginx/live-proxy.conf.template"));
  assert.deepEqual(
    d.filter((l) => l.startsWith("set_real_ip_from")),
    ["set_real_ip_from ${LIVE_TRUSTED_PROXY};"],
  );
  assert.ok(d.includes("real_ip_header X-Real-IP;"));
  assert.ok(d.includes("real_ip_recursive off;"));
  assert.ok(d.includes("proxy_set_header X-Real-IP         $remote_addr;"));
  assert.ok(d.includes("proxy_set_header X-Forwarded-For   $remote_addr;"));
  assert.ok(
    !d.some((l) => /proxy_add_x_forwarded_for|\$http_x_real_ip/.test(l)),
  );
});

test("the platform site's https block in the README goes to 8094 for the live site", () => {
  const readme = read("deploy/README.md");
  assert.match(readme, /proxy_pass http:\/\/127\.0\.0\.1:8094;/);
});

test("the live deploy never starts the demo or the sample-data platform", () => {
  const wf = read(".github/workflows/deploy.yml");
  const start = wf.indexOf('if [ "$SITE_MODE" = live ]; then');
  const end = wf.indexOf("exit 0\n", start);
  assert.ok(start > 0 && end > start, "no live branch");
  const live = wf.slice(start, end);
  assert.ok(!/up -d (--[a-z-]+ )*(web|platform)\b(?!-)/.test(live));
  assert.ok(!live.includes("mock_up"));
  assert.ok(
    live.includes("for ps in mhai-web/web mhai-web-platform/platform; do"),
  );
  assert.ok(live.includes("[ -f /srv/mhai-backend/live-site ] ||"));
  assert.ok(live.includes('start_live "$web_dir" compose.yml web-live 8093'));
  assert.ok(
    live.includes(
      'start_live "$plat_dir" compose.platform.yml platform-live 8094',
    ),
  );
  // The live branch comes before anything the demo starts.
  assert.ok(start < wf.indexOf("mock_up() {"));
  // A typo never runs the demo.
  assert.match(
    wf,
    /\*\) echo "::error::Repository variable SITE_MODE must be demo or live/,
  );
});
