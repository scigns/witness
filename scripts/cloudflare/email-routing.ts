export const DOMAIN = 'buildwithwitness.com';

export const witnessEmailRoutes = [
  {
    address: `finance@${DOMAIN}`,
    department: 'finance',
    purpose: 'Billing, invoices and financial correspondence',
  },
  {
    address: `support@${DOMAIN}`,
    department: 'support',
    purpose: 'Customer support, onboarding and product help',
  },
  {
    address: `contracts@${DOMAIN}`,
    department: 'contracts',
    purpose: 'Contracts, procurement and institutional agreements',
  },
  {
    address: `engineering@${DOMAIN}`,
    department: 'engineering',
    purpose: 'Production, integrations and technical escalation',
  },
  {
    address: `security@${DOMAIN}`,
    department: 'security',
    purpose: 'Security reports, questionnaires and responsible disclosure',
  },
  {
    address: `privacy@${DOMAIN}`,
    department: 'privacy',
    purpose: 'Privacy, data requests and governance',
  },
  {
    address: `hello@${DOMAIN}`,
    department: 'hello',
    purpose: 'General, sales, partnership and design-partner enquiries',
  },
] as const;

export type RoutingRule = {
  id?: string;
  name?: string;
  enabled?: boolean;
  matchers?: Array<{ type: string; field?: string; value?: string }>;
  actions?: Array<{ type: string; value?: string[] }>;
};
export type Destination = { id?: string; email?: string; verified?: string | null };
type ApiEnvelope<T> = {
  success: boolean;
  result: T;
  errors?: Array<{ code?: number; message?: string }>;
  result_info?: { page?: number; total_pages?: number };
};
export type FetchLike = typeof fetch;

export class CloudflareApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CloudflareApiError';
  }
}

export class CloudflareClient {
  constructor(
    private token: string,
    private fetcher: FetchLike = fetch,
    private base = 'https://api.cloudflare.com/client/v4',
  ) {}
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    let body: ApiEnvelope<T> | undefined;
    try {
      body = (await response.json()) as ApiEnvelope<T>;
    } catch {
      /* normalized below */
    }
    if (!response.ok || !body?.success) {
      const detail =
        body?.errors?.map((error) => error.message || `code ${error.code}`).join('; ') ||
        response.statusText ||
        'request failed';
      throw new CloudflareApiError(response.status, `Cloudflare API ${response.status}: ${detail}`);
    }
    return body.result;
  }
  async list<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    for (let page = 1; ; page += 1) {
      const separator = path.includes('?') ? '&' : '?';
      const response = await this.fetcher(
        `${this.base}${path}${separator}page=${page}&per_page=50`,
        { headers: { Authorization: `Bearer ${this.token}` } },
      );
      const body = (await response.json()) as ApiEnvelope<T[]>;
      if (!response.ok || !body.success)
        throw new CloudflareApiError(
          response.status,
          `Cloudflare API ${response.status}: ${body.errors?.map((e) => e.message).join('; ') || response.statusText}`,
        );
      items.push(...body.result);
      if (!body.result_info?.total_pages || page >= body.result_info.total_pages) return items;
    }
  }
}

async function listDestinations(client: CloudflareClient, accountId: string) {
  const [verified, unverified] = await Promise.all([
    client.list<Destination>(`/accounts/${accountId}/email/routing/addresses?verified=true`),
    client.list<Destination>(`/accounts/${accountId}/email/routing/addresses?verified=false`),
  ]);
  return [...verified, ...unverified];
}

export function redact(value: string, secrets: string[]): string {
  return secrets
    .filter(Boolean)
    .reduce((text, secret) => text.split(secret).join('[REDACTED]'), value);
}

export function literalAddress(rule: RoutingRule): string | undefined {
  return rule.matchers
    ?.find((matcher) => matcher.type === 'literal' && matcher.field === 'to')
    ?.value?.toLowerCase();
}

export function planRoutes(rules: RoutingRule[], destination: string) {
  const byAddress = new Map<string, RoutingRule[]>();
  for (const rule of rules) {
    const address = literalAddress(rule);
    if (address) byAddress.set(address, [...(byAddress.get(address) || []), rule]);
  }
  const existing: string[] = [];
  const create: string[] = [];
  const conflicts: string[] = [];
  for (const route of witnessEmailRoutes) {
    const matches = byAddress.get(route.address) || [];
    if (!matches.length) create.push(route.address);
    else if (
      matches.some((rule) =>
        rule.actions?.some(
          (action) =>
            action.type === 'forward' &&
            action.value?.map((v) => v.toLowerCase()).includes(destination.toLowerCase()),
        ),
      )
    )
      existing.push(route.address);
    else conflicts.push(route.address);
  }
  return { existing, create, conflicts };
}

export type RunOptions = {
  apply: boolean;
  env: NodeJS.ProcessEnv;
  client: CloudflareClient;
  log?: (line: string) => void;
};

export async function runEmailRouting({
  apply,
  env,
  client,
  log = (line) => process.stdout.write(`${line}\n`),
}: RunOptions) {
  const token = env.CLOUDFLARE_API_TOKEN || '';
  const accountId = env.CLOUDFLARE_ACCOUNT_ID || '';
  const zoneId = env.CLOUDFLARE_ZONE_ID || '';
  const destination = (env.WITNESS_EMAIL_ROUTING_DESTINATION || '').trim().toLowerCase();
  const missing = [
    ['CLOUDFLARE_API_TOKEN', token],
    ['CLOUDFLARE_ACCOUNT_ID', accountId],
    ['CLOUDFLARE_ZONE_ID', zoneId],
    ['WITNESS_EMAIL_ROUTING_DESTINATION', destination],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length)
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);

  const safeLog = (line: string) => log(redact(line, [token, destination]));
  const zone = await client.request<{ id: string; name: string; account?: { id?: string } }>(
    `/zones/${zoneId}`,
  );
  if (zone.name.toLowerCase() !== DOMAIN || zone.id !== zoneId)
    throw new Error(`CLOUDFLARE_ZONE_ID does not resolve to ${DOMAIN}`);
  if (zone.account?.id && zone.account.id !== accountId)
    throw new Error('CLOUDFLARE_ACCOUNT_ID does not own the configured zone');

  const [settings, destinations, rules, catchAll] = await Promise.all([
    client.request<{ enabled: boolean; status?: string; name: string }>(
      `/zones/${zoneId}/email/routing`,
    ),
    listDestinations(client, accountId),
    client.list<RoutingRule>(`/zones/${zoneId}/email/routing/rules`),
    client.request<RoutingRule>(`/zones/${zoneId}/email/routing/rules/catch_all`),
  ]);
  let destinationEntry = destinations.find((item) => item.email?.toLowerCase() === destination);
  const plan = planRoutes(rules, destination);
  const blockers: string[] = [];
  if (!settings.enabled || settings.status !== 'ready')
    blockers.push(
      `Email Routing is not ready (enabled=${settings.enabled}, status=${settings.status || 'unknown'}); enable/onboard it separately after reviewing MX records`,
    );
  if (!destinationEntry)
    blockers.push(
      'Destination is not registered; apply can request verification, but rules must wait',
    );
  else if (!destinationEntry.verified)
    blockers.push('Destination exists but manual email verification is pending');
  if (plan.conflicts.length)
    blockers.push(`Existing rules use different actions: ${plan.conflicts.join(', ')}`);

  safeLog(`Witness Email Routing\nDomain: ${DOMAIN}\nMode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  safeLog(`\nEXISTING\n${plan.existing.length ? plan.existing.join('\n') : '(none)'}`);
  safeLog(`\nTO CREATE\n${plan.create.length ? plan.create.join('\n') : '(none)'}`);
  safeLog(
    `\nUNCHANGED\nExisting unrelated rules: ${rules.filter((r) => !witnessEmailRoutes.some((route) => route.address === literalAddress(r))).length}\nCatch-all: ${catchAll.enabled ? 'enabled (preserved)' : 'disabled (preserved)'}`,
  );
  safeLog(`\nBLOCKERS\n${blockers.length ? blockers.join('\n') : '(none)'}`);

  const created: string[] = [];
  if (apply && !destinationEntry) {
    destinationEntry = await client.request<Destination>(
      `/accounts/${accountId}/email/routing/addresses`,
      { method: 'POST', body: JSON.stringify({ email: destination }) },
    );
    safeLog(
      'Destination verification requested. Check the destination inbox, verify it, then run apply again. No rules were created.',
    );
    return {
      settings,
      plan,
      created,
      verification: 'requested',
      catchAllEnabled: Boolean(catchAll.enabled),
    };
  }
  if (apply && blockers.length) throw new Error(`Apply blocked: ${blockers.join('; ')}`);
  if (apply) {
    for (const route of witnessEmailRoutes.filter((item) => plan.create.includes(item.address))) {
      await client.request<RoutingRule>(`/zones/${zoneId}/email/routing/rules`, {
        method: 'POST',
        body: JSON.stringify({
          enabled: true,
          name: `Witness ${route.department}`,
          matchers: [{ type: 'literal', field: 'to', value: route.address }],
          actions: [{ type: 'forward', value: [destination] }],
        }),
      });
      created.push(route.address);
    }
    const [finalSettings, finalDestinations, finalRules, finalCatchAll] = await Promise.all([
      client.request<{ enabled: boolean; status?: string }>(`/zones/${zoneId}/email/routing`),
      listDestinations(client, accountId),
      client.list<RoutingRule>(`/zones/${zoneId}/email/routing/rules`),
      client.request<RoutingRule>(`/zones/${zoneId}/email/routing/rules/catch_all`),
    ]);
    const finalPlan = planRoutes(finalRules, destination);
    const finalDestination = finalDestinations.find(
      (item) => item.email?.toLowerCase() === destination && item.verified,
    );
    if (
      !finalSettings.enabled ||
      finalSettings.status !== 'ready' ||
      !finalDestination ||
      finalPlan.create.length ||
      finalPlan.conflicts.length ||
      Boolean(finalCatchAll.enabled) !== Boolean(catchAll.enabled)
    )
      throw new Error('Final Cloudflare state verification failed');
    safeLog(`\nVERIFIED\n${witnessEmailRoutes.map((route) => route.address).join('\n')}`);
  }
  return {
    settings,
    plan,
    created,
    verification: destinationEntry?.verified ? 'verified' : 'missing-or-pending',
    catchAllEnabled: Boolean(catchAll.enabled),
  };
}
