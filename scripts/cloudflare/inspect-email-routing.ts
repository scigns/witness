import { CloudflareClient, redact, runEmailRouting } from './email-routing.js';

const token = process.env.CLOUDFLARE_API_TOKEN || '';
runEmailRouting({ apply: false, env: process.env, client: new CloudflareClient(token) }).catch(
  (error: unknown) => {
    console.error(
      redact(error instanceof Error ? error.message : 'Email Routing inspection failed', [
        token,
        process.env.WITNESS_EMAIL_ROUTING_DESTINATION || '',
      ]),
    );
    process.exitCode = 1;
  },
);
