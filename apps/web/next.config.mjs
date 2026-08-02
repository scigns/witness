/**
 * Next.js configuration.
 *
 * `output: 'standalone'` is not a preference. TECH_STACK.md accepts deep Next.js
 * coupling on the condition that we deploy in standalone Node output and use no
 * hosting-provider-specific feature — that is what keeps a sovereign self-hosted
 * deployment possible (principle P1). Removing this line breaks that commitment.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@witness/contracts'],
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
