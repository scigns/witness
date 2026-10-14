// WITNESS_MARKETING_BUILD_TARGET=pages switches to a static export for an
// independent Cloudflare Pages deployment that needs no Node server, API,
// database or Tunnel — see
// docs/operations/witness-website-recovery-2026-10-14.md. The default
// (unset) remains the existing portable Node/Docker boundary.
const isStaticExport = process.env.WITNESS_MARKETING_BUILD_TARGET === 'pages';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isStaticExport ? 'export' : 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // `next export` has no server to attach response headers to; the static
  // Pages build gets the same headers from public/_headers instead.
  ...(isStaticExport
    ? {}
    : {
        async headers() {
          return [
            {
              source: '/:path*',
              headers: [
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'X-Frame-Options', value: 'DENY' },
                {
                  key: 'Permissions-Policy',
                  value: 'camera=(), geolocation=(), microphone=(), payment=()',
                },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
