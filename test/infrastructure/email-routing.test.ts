import { describe, expect, it, vi } from 'vitest';
import {
  CloudflareClient,
  planRoutes,
  redact,
  runEmailRouting,
  witnessEmailRoutes,
  type RoutingRule,
} from '../../scripts/cloudflare/email-routing.js';

const destination = 'ops@example.test';
const matchingRule = (address: string): RoutingRule => ({
  enabled: true,
  matchers: [{ type: 'literal', field: 'to', value: address }],
  actions: [{ type: 'forward', value: [destination] }],
});

describe('Witness Email Routing', () => {
  it('declares exactly the seven unique departmental routes', () => {
    expect(witnessEmailRoutes.map((route) => route.department)).toEqual([
      'finance',
      'support',
      'contracts',
      'engineering',
      'security',
      'privacy',
      'hello',
    ]);
    expect(new Set(witnessEmailRoutes.map((route) => route.address)).size).toBe(7);
  });

  it('detects duplicates and conflicting existing rules without overwriting them', () => {
    const rules = [
      matchingRule(witnessEmailRoutes[0].address),
      {
        ...matchingRule(witnessEmailRoutes[1].address),
        actions: [{ type: 'worker', value: ['existing-worker'] }],
      },
    ];
    const plan = planRoutes(rules, destination);
    expect(plan.existing).toEqual([witnessEmailRoutes[0].address]);
    expect(plan.conflicts).toEqual([witnessEmailRoutes[1].address]);
    expect(plan.create).toHaveLength(5);
  });

  it('redacts tokens and destination addresses', () => {
    expect(redact('token=secret dest=ops@example.test', ['secret', destination])).toBe(
      'token=[REDACTED] dest=[REDACTED]',
    );
  });

  it('normalizes API errors without exposing authorization', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: false, errors: [{ message: 'forbidden' }] }), {
          status: 403,
        }),
    ) as unknown as typeof fetch;
    const client = new CloudflareClient('secret', fetcher, 'https://test.invalid');
    await expect(client.request('/test')).rejects.toEqual(
      expect.objectContaining({
        status: 403,
        message: 'Cloudflare API 403: forbidden',
      }),
    );
    expect(JSON.stringify(fetcher.mock.calls)).toContain('Bearer secret');
  });

  it('keeps dry-run read-only and reports pending destination verification', async () => {
    const client = fakeClient({ destinationVerified: false });
    const result = await runEmailRouting({ apply: false, env: validEnv(), client, log: vi.fn() });
    expect(result.verification).toBe('missing-or-pending');
    expect(client.request).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('requests an absent destination and creates no rules until verification', async () => {
    const client = fakeClient({ destinationPresent: false });
    const result = await runEmailRouting({ apply: true, env: validEnv(), client, log: vi.fn() });
    expect(result.verification).toBe('requested');
    expect(client.request).toHaveBeenCalledTimes(4);
    expect(client.list).toHaveBeenCalledTimes(3);
  });

  it('creates only missing rules and re-queries final state', async () => {
    const client = fakeClient({ destinationVerified: true, existingCount: 1, finalComplete: true });
    const result = await runEmailRouting({ apply: true, env: validEnv(), client, log: vi.fn() });
    expect(result.created).toHaveLength(6);
    expect(client.list).toHaveBeenCalledTimes(6);
  });

  it('never invokes delete or updates the catch-all', async () => {
    const client = fakeClient({ destinationVerified: true, existingCount: 7, catchAll: true });
    await runEmailRouting({ apply: true, env: validEnv(), client, log: vi.fn() });
    for (const call of client.request.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      expect(init?.method).not.toBe('DELETE');
      if (String(call[0]).includes('catch_all')) expect(init?.method).toBeUndefined();
    }
  });
});

function validEnv(): NodeJS.ProcessEnv {
  return {
    CLOUDFLARE_API_TOKEN: 'secret',
    CLOUDFLARE_ACCOUNT_ID: 'account',
    CLOUDFLARE_ZONE_ID: 'zone',
    WITNESS_EMAIL_ROUTING_DESTINATION: destination,
  };
}

function fakeClient(options: {
  destinationPresent?: boolean;
  destinationVerified?: boolean;
  existingCount?: number;
  finalComplete?: boolean;
  catchAll?: boolean;
}) {
  const existingCount = options.existingCount || 0;
  let listCalls = 0;
  const initialRules = witnessEmailRoutes
    .slice(0, existingCount)
    .map((route) => matchingRule(route.address));
  const client = {
    request: vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/zones/zone')
        return { id: 'zone', name: 'buildwithwitness.com', account: { id: 'account' } };
      if (path.endsWith('/email/routing'))
        return { enabled: true, status: 'ready', name: 'buildwithwitness.com' };
      if (path.endsWith('catch_all'))
        return { enabled: Boolean(options.catchAll), matchers: [{ type: 'all' }] };
      if (path.includes('/addresses') && init?.method === 'POST')
        return { email: destination, verified: null };
      return matchingRule('created@buildwithwitness.com');
    }),
    list: vi.fn(async (path: string) => {
      listCalls += 1;
      if (path.includes('/addresses'))
        return options.destinationPresent === false
          ? []
          : [
              {
                email: destination,
                verified: options.destinationVerified ? '2026-09-01T00:00:00Z' : null,
              },
            ];
      if (options.finalComplete && listCalls >= 6)
        return witnessEmailRoutes.map((route) => matchingRule(route.address));
      return initialRules;
    }),
  };
  return client as unknown as CloudflareClient & {
    request: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };
}
