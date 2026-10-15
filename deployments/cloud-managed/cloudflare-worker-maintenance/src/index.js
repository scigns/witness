/**
 * Independent maintenance fallback for `app.buildwithwitness.com`.
 *
 * Context: docs/operations/witness-website-recovery-2026-10-14.md. The
 * DigitalOcean account hosting `witness-prod-01` is locked, and the droplet
 * is powered off — every request to `app.`/`api.`/`id.` that depends on the
 * `witness-prod` Cloudflare Tunnel fails at Cloudflare's edge with error 1033
 * ("tunnel not connected") before it ever reaches application code. No
 * origin-side fix (restarting a container, redeploying) is possible while
 * the droplet is off, so the fallback has to live entirely at the edge, with
 * no dependency on that droplet or any other DigitalOcean resource.
 *
 * Scope: this Worker is bound ONLY to `app.buildwithwitness.com/*`. It must
 * never be routed onto `api.` or `id.` — those carry the real OIDC
 * authorization-code flow (browser → id. → api. callback → app.), and a
 * maintenance page in the middle of that exchange would corrupt it. Keeping
 * the fallback scoped to the web app host, not the whole zone or the
 * API/identity hosts, is what "preserves existing API semantics" and
 * "avoids intercepting legitimate authentication flows" in practice: there
 * is nothing here to intercept because the route pattern never matches
 * those hosts.
 *
 * MODE is a Workers KV value, toggled without a redeploy — see this
 * directory's README for the exact enable/disable commands:
 *
 *   "off"         Pass every request straight through to the real origin,
 *                 unmodified, exactly as if this Worker did not exist. This
 *                 is the default and the only mode while nothing is wrong.
 *
 *   "maintenance" Never contact the origin. Serve the static maintenance
 *                 page for every request, with HTTP 503 and a short
 *                 Retry-After. This is the mode for a known, ongoing outage
 *                 like the current one — deterministic, and correct even
 *                 when the origin is completely unreachable (there is
 *                 nothing to time out on).
 *
 *   "auto"        Try the real origin first; serve the maintenance page only
 *                 if that attempt fails or returns a server error. Present
 *                 but NOT the recommended default: it has not been verified
 *                 against a live failure yet (that requires deploying this
 *                 Worker and only reading its behaviour, not exercising a
 *                 real production outage to test it), and auto-detection of
 *                 "is the origin actually healthy" is exactly the kind of
 *                 logic that can flap or mask a slow-mode partial failure.
 *                 Switch to this only after "maintenance" has been used for
 *                 a real incident and the fallback is trusted.
 */

const MAINTENANCE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Witness — Temporarily unavailable</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0b0c0f;
    color: #e7e9ee;
  }
  main { max-width: 34rem; text-align: center; }
  h1 { font-size: 1.5rem; font-weight: 600; margin: 0 0 0.75rem; }
  p { line-height: 1.55; color: #a7acb8; margin: 0 0 1.25rem; }
  a {
    display: inline-block;
    padding: 0.6rem 1.25rem;
    border-radius: 0.5rem;
    background: #e7e9ee;
    color: #0b0c0f;
    text-decoration: none;
    font-weight: 600;
  }
  a:focus-visible, a:hover { outline: 2px solid #e7e9ee; outline-offset: 2px; }
</style>
</head>
<body>
<main>
  <h1>Witness is temporarily unavailable</h1>
  <p>
    Our application services are currently offline. We are working to
    restore access when our infrastructure is available.
  </p>
  <p>
    You can continue exploring Witness and learning about our work through
    our <a href="https://www.buildwithwitness.com/">main website</a>.
  </p>
</main>
</body>
</html>`;

function maintenanceResponse() {
  return new Response(MAINTENANCE_HTML, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Retry-After': '300',
      // Never let a 503 for an authenticated app host linger in any cache,
      // shared or private, once the application is back.
      'Cache-Control': 'no-store, must-revalidate',
      'X-Witness-Maintenance': 'true',
    },
  });
}

async function readMode(env) {
  if (!env.MAINTENANCE_KV) {
    // No KV binding configured — fail safe to "off" (pass-through) rather
    // than accidentally blocking the app host if the binding is ever
    // misconfigured during a future redeploy.
    return 'off';
  }
  const value = await env.MAINTENANCE_KV.get('MODE');
  return value === 'maintenance' || value === 'auto' ? value : 'off';
}

export default {
  async fetch(request, env) {
    const mode = await readMode(env);

    if (mode === 'off') {
      return fetch(request);
    }

    if (mode === 'maintenance') {
      return maintenanceResponse();
    }

    // mode === 'auto'
    try {
      const originResponse = await fetch(request, { cf: { cacheTtl: 0 } });
      if (originResponse.status >= 500) {
        return maintenanceResponse();
      }
      return originResponse;
    } catch {
      return maintenanceResponse();
    }
  },
};
