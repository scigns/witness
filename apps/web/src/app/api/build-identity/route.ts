/** Public artifact identity, compiled into the web image; contains no configuration secrets. */
export const dynamic = 'force-static';

export function GET() {
  return Response.json({ buildId: process.env['WITNESS_BUILD_ID'] });
}
