// Fixed payload regardless of request — safe to statically export for the
// Cloudflare Pages build as well as serve from the Node/Docker standalone build.
export const dynamic = 'force-static';

export function GET(): Response {
  return Response.json(
    { service: 'witness-marketing', status: 'ok' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
