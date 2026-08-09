/**
 * Next.js configuration.
 *
 * `output: 'standalone'` is not a preference. TECH_STACK.md accepts deep Next.js
 * coupling on the condition that we deploy in standalone Node output and use no
 * hosting-provider-specific feature — that is what keeps a sovereign self-hosted
 * deployment possible (principle P1). Removing this line breaks that commitment.
 */
/**
 * Where the application is served from, when that is not the root of its
 * origin. The Cloudflare trial puts Witness at `/witness` on a domain whose
 * `/` is somebody else's homepage, and every asset URL, route and link Next
 * emits has to carry that prefix — which is a build-time decision, not a
 * runtime one. Empty (a dedicated hostname) is the default, and the local
 * developer's case.
 */
const basePath = process.env.NEXT_PUBLIC_WITNESS_BASE_PATH ?? '';

if (basePath !== '' && (!basePath.startsWith('/') || basePath.endsWith('/'))) {
  throw new Error(
    `NEXT_PUBLIC_WITNESS_BASE_PATH must start with "/" and not end with one — got "${basePath}"`,
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  ...(basePath === '' ? {} : { basePath }),
  // Which deployment this bundle is for, mirroring the API's
  // WITNESS_DEPLOYMENT_PROFILE. Declared here rather than read straight from
  // `process.env` in application code so that Next inlines one value into the
  // server render and the client bundle alike: read at runtime, the two
  // disagree, and the banner flips between "Developer Preview" and "Internal
  // pilot" on hydration. Defaults to `development` so `pnpm dev` needs no setup.
  env: {
    WITNESS_BUILD_PROFILE: process.env.NEXT_PUBLIC_WITNESS_PROFILE ?? 'development',
  },
  reactStrictMode: true,
  transpilePackages: ['@witness/contracts'],
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
