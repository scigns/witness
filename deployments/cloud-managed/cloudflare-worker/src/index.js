/**
 * Route `pacificdigitalconsultancy.org/witness*` to Witness.
 *
 * The apex domain already serves somebody else's homepage and must keep doing
 * so. A Worker route is path-scoped, so `/` and everything else on the zone is
 * untouched: Cloudflare only invokes this Worker for paths that match the
 * route pattern, and every other request goes to the existing origin exactly
 * as it does today.
 *
 * What this is not: it is not the API, and it is not a rewrite layer. It
 * forwards the request unchanged to the tunnel-backed web hostname and returns
 * the response. Next.js is built with `basePath: '/witness'`, so the origin
 * already expects the prefix and no path surgery is needed here — which is the
 * point. A Worker that rewrites paths is a Worker that has to be kept in step
 * with the application's routing table forever.
 *
 * The browser's address bar keeps `https://pacificdigitalconsultancy.org/witness`.
 * A redirect would have been smaller still and is wrong: it would move users
 * onto the origin hostname, which then has to become the origin Witness knows
 * about, which defeats the requirement.
 *
 * If `WITNESS_ORIGIN_SECRET` is bound, it is sent as `X-Witness-Origin-Secret`.
 * Pair it with a WAF rule on the origin hostname that blocks requests without
 * it, and the path route becomes the only way in rather than one of two.
 */

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);

    const target = new URL(
      incoming.pathname + incoming.search,
      `https://${env.WITNESS_ORIGIN_HOST}`,
    );

    const headers = new Headers(request.headers);
    if (typeof env.WITNESS_ORIGIN_SECRET === 'string' && env.WITNESS_ORIGIN_SECRET !== '') {
      headers.set('X-Witness-Origin-Secret', env.WITNESS_ORIGIN_SECRET);
    }
    // The application builds absolute URLs from configuration, never from this
    // header, but a proxy that lies about the visitor's host is a debugging
    // trap for whoever reads the logs next.
    headers.set('X-Forwarded-Host', incoming.host);
    headers.set('X-Forwarded-Proto', 'https');

    const response = await fetch(
      new Request(target, {
        method: request.method,
        headers,
        body: request.body,
        // A 302 from the application — the OIDC hand-off, a trailing-slash
        // normalisation — belongs to the browser, not to this Worker.
        redirect: 'manual',
      }),
    );

    // Cloned so the headers are mutable; the body streams through untouched.
    const out = new Response(response.body, response);
    out.headers.set('X-Witness-Route', 'worker');
    return out;
  },
};
