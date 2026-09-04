export function GET(): Response {
  return Response.json(
    { service: 'witness-marketing', status: 'ok' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
