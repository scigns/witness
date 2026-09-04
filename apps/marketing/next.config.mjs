/** @type {import('next').NextConfig} */
const nextConfig = {
  // Match the product application's portable Node deployment boundary. This
  // can run behind Cloudflare without choosing Pages, Workers or a live route
  // during MKT-01A.
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
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
};

export default nextConfig;
