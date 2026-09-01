import { CloudflareClient, redact, runEmailRouting } from './email-routing.js';

if (!process.argv.includes('--apply')) throw new Error('Refusing mutation without --apply');
const token = process.env.CLOUDFLARE_API_TOKEN || '';
runEmailRouting({ apply: true, env: process.env, client: new CloudflareClient(token) }).catch(
  (error: unknown) => {
    console.error(
      redact(error instanceof Error ? error.message : 'Email Routing apply failed', [
        token,
        process.env.WITNESS_EMAIL_ROUTING_DESTINATION || '',
      ]),
    );
    process.exitCode = 1;
  },
);
