'use client';

/**
 * Platform-administration inspection and override management (ADR-0034's
 * sibling commercial-entitlement work). Gated server-side by `operator:read`
 * (inspection) and `commercial_override:manage` (the form below) -- both
 * PLATFORM_ONLY_ACTIONS, so an organisation's own admin gets the same 403
 * here as any other operator-only page, same as `/operator` itself.
 */

import { use, useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  EffectiveCommercialConfigurationView,
  SubscriptionEntitlementOverrideView,
} from '@witness/contracts';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, EmptyState, ErrorNotice } from '@/components/ui';

export default function OperatorCommercialConfigurationPage({
  params,
}: {
  params: Promise<{ organisationId: string }>;
}) {
  const { organisationId } = use(params);
  const { user, ready } = useSession();
  const [config, setConfig] = useState<EffectiveCommercialConfigurationView | null>(null);
  const [overrides, setOverrides] = useState<SubscriptionEntitlementOverrideView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [entitlementKey, setEntitlementKey] = useState('');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [nextConfig, nextOverrides] = await Promise.all([
        api.getOperatorCommercialConfiguration(organisationId, user),
        api.listCommercialOverrides(organisationId, user),
      ]);
      setConfig(nextConfig);
      setOverrides(nextOverrides);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Commercial configuration unavailable.',
      );
    }
  }, [organisationId, user]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  const submitOverride = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      // The entitlement's own value type decides BOOLEAN/INTEGER/STRING at
      // the server; this is only a best-effort client-side guess so a
      // number or true/false does not get sent as a quoted string for no
      // reason. The server rejects a mismatch regardless (see
      // CommercialOverrideService.upsert), so a wrong guess here is a
      // validation error, never a silently wrong override.
      const parsedValue: boolean | number | string =
        value === 'true'
          ? true
          : value === 'false'
            ? false
            : /^-?\d+$/.test(value)
              ? Number(value)
              : value;
      await api.setCommercialOverride(
        organisationId,
        { entitlementKey, value: parsedValue, reason },
        user,
      );
      setEntitlementKey('');
      setValue('');
      setReason('');
      await load();
    } catch (caught) {
      setFormError(
        caught instanceof ApiError ? caught.message : 'The override could not be recorded.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (error && !config) return <ErrorNotice message={error} />;
  if (!config || !overrides) return <p role="status">Loading commercial configuration…</p>;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-[var(--color-ink-muted)]">Commercial operations</p>
        <h1 className="text-3xl font-bold">Commercial configuration</h1>
        <p>Organisation {organisationId}</p>
      </header>
      {error && <ErrorNotice message={error} />}

      <Card>
        <h2 className="text-xl font-semibold">Effective configuration</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <dt>Plan</dt>
          <dd>{config.planCode}</dd>
          <dt>Subscription status</dt>
          <dd>{config.subscriptionStatus}</dd>
          <dt>Deployment isolation</dt>
          <dd>{config.deploymentIsolation}</dd>
          <dt>Support level</dt>
          <dd>{config.supportLevel}</dd>
        </dl>
        {config.resourceProfile && (
          <div className="mt-4">
            <h3 className="font-medium">Resource profile: {config.resourceProfile.name}</h3>
            <p className="text-sm text-[var(--color-ink-muted)]">
              {config.resourceProfile.description}
            </p>
            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
              <dt>Compute</dt>
              <dd>{config.resourceProfile.computeClass}</dd>
              <dt>Memory</dt>
              <dd>{config.resourceProfile.memoryClass}</dd>
              <dt>Storage</dt>
              <dd>
                {(Number(config.resourceProfile.storageQuotaBytes) / 1073741824).toFixed(1)} GB
              </dd>
              <dt>Concurrency</dt>
              <dd>{config.resourceProfile.concurrencyLimit}</dd>
              <dt>Workers</dt>
              <dd>{config.resourceProfile.workerAllocation}</dd>
              <dt>Job limit</dt>
              <dd>{config.resourceProfile.jobLimit}</dd>
              <dt>Backup</dt>
              <dd>{config.resourceProfile.backupProfile}</dd>
              <dt>Retention</dt>
              <dd>{config.resourceProfile.retentionProfile}</dd>
            </dl>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-xl font-semibold">Resolved entitlements</h2>
        {config.entitlements.length === 0 ? (
          <EmptyState
            title="No entitlements"
            body="No entitlements resolve for this subscription."
          />
        ) : (
          <ul className="mt-3 columns-1 text-sm sm:columns-2">
            {config.entitlements.map((entry) => (
              <li key={entry.key} className="mb-2">
                {entry.key}: <strong>{String(entry.value)}</strong>{' '}
                <span className="text-[var(--color-ink-muted)]">
                  ({entry.source === 'SUBSCRIPTION_OVERRIDE' ? 'overridden' : 'plan default'})
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-xl font-semibold">Overrides</h2>
        {overrides.length === 0 ? (
          <EmptyState title="No overrides" body="No negotiated overrides on this subscription." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-line)]">
                  <th className="py-2">Key</th>
                  <th>Value</th>
                  <th>Reason</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {overrides.map((o) => (
                  <tr key={o.id} className="border-b border-[var(--color-line)]">
                    <td className="py-2 font-medium">{o.entitlementKey}</td>
                    <td>{String(o.value)}</td>
                    <td>{o.reason}</td>
                    <td>{new Date(o.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-xl font-semibold">Set or replace an override</h2>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Institutional sales are negotiated. A reason is required for every override --
          auditability of commercial exceptions is not optional.
        </p>
        {formError && <ErrorNotice message={formError} />}
        <form onSubmit={submitOverride} className="mt-4 space-y-4">
          <label className="block">
            Entitlement key
            <input
              value={entitlementKey}
              onChange={(e) => setEntitlementKey(e.target.value)}
              placeholder="deployment.isolation"
              required
              className="mt-1 block w-full"
            />
          </label>
          <label className="block">
            Value
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="DEDICATED, 500, or true/false"
              required
              className="mt-1 block w-full"
            />
          </label>
          <label className="block">
            Reason
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              maxLength={500}
              className="mt-1 block w-full"
            />
          </label>
          <Button type="submit" disabled={busy} variant="primary">
            {busy ? 'Saving…' : 'Set override'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
