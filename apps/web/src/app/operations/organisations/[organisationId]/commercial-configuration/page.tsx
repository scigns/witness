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
  TenantProvisioningView,
  OrganisationStorageUsage,
  OrganisationUsage,
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
  const [provisioning, setProvisioning] = useState<TenantProvisioningView | null>(null);
  const [config, setConfig] = useState<EffectiveCommercialConfigurationView | null>(null);
  const [overrides, setOverrides] = useState<SubscriptionEntitlementOverrideView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [storage, setStorage] = useState<OrganisationStorageUsage | null>(null);
  const [usage, setUsage] = useState<OrganisationUsage | null>(null);
  const [reconciliation, setReconciliation] = useState<Record<string, unknown> | null>(null);
  const [quotaInput, setQuotaInput] = useState('');

  const [entitlementKey, setEntitlementKey] = useState('');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [nextConfig, nextOverrides, nextStorage, nextUsage, nextProvisioning] =
        await Promise.all([
          api.getOperatorCommercialConfiguration(organisationId, user),
          api.listCommercialOverrides(organisationId, user),
          api.getOperatorOrganisationStorage(organisationId, user),
          api.getOperatorOrganisationUsage(organisationId, user),
          api.getOperatorProvisioning(organisationId, user),
        ]);
      setConfig(nextConfig);
      setProvisioning(nextProvisioning);
      setStorage(nextStorage);
      setUsage(nextUsage);
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

  const inspectStorage = async (cleanExpired = false) => {
    setBusy(true);
    setFormError(null);
    try {
      if (cleanExpired) await api.cleanExpiredStorageReservations(organisationId, user);
      setReconciliation(await api.reconcileOrganisationStorage(organisationId, user));
      await load();
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Storage inspection failed.');
    } finally {
      setBusy(false);
    }
  };

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

  const updateQuota = async (event: FormEvent) => {
    event.preventDefault();
    const quotaBytes = quotaInput === '' ? null : Math.round(Number(quotaInput) * 1073741824);
    if (quotaBytes !== null && (!Number.isSafeInteger(quotaBytes) || quotaBytes < 0)) return;
    setBusy(true);
    setFormError(null);
    try {
      await api.updateStorageQuota(organisationId, { quotaBytes }, user);
      setQuotaInput('');
      await load();
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Allocation update failed.');
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
          <dt>Contracted deployment isolation</dt>
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

      {provisioning && (
        <Card>
          <h2 className="text-xl font-semibold">Tenant provisioning</h2>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <dt>Technical tenant</dt>
            <dd className="break-all">{provisioning.tenantId}</dd>
            <dt>Assignment</dt>
            <dd>{provisioning.tenantAssignment}</dd>
            <dt>Desired isolation</dt>
            <dd>{provisioning.desired.deploymentIsolation}</dd>
            <dt>Desired profile</dt>
            <dd>{provisioning.desired.resourceProfileCode}</dd>
            <dt>Observed state</dt>
            <dd>{provisioning.observed.state}</dd>
            <dt>Observed isolation</dt>
            <dd>{provisioning.observed.deploymentIsolation ?? 'Unverified'}</dd>
            <dt>Observed profile</dt>
            <dd>{provisioning.observed.resourceProfileCode ?? 'Unverified'}</dd>
            <dt>Last verified</dt>
            <dd>{provisioning.observed.verifiedAt ?? 'Not verified'}</dd>
          </dl>
          <p className="mt-3 text-sm">{provisioning.observed.detail}</p>
        </Card>
      )}
      <Card>
        <h2 className="text-xl font-semibold">Storage reconciliation</h2>
        <p className="mt-2 text-sm">
          Inspect persistent bytes and accounting. Reports preserve evidence. Cleanup releases
          expired uploads that never started; uncertain writes remain reserved.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button disabled={busy} onClick={() => void inspectStorage()}>
            Inspect storage
          </Button>
          <Button disabled={busy} onClick={() => void inspectStorage(true)}>
            Clean expired reservations
          </Button>
        </div>
        {reconciliation && (
          <pre
            tabIndex={0}
            aria-label="Storage reconciliation report"
            className="mt-3 overflow-auto whitespace-pre-wrap break-all text-sm"
          >
            {JSON.stringify(reconciliation, null, 2)}
          </pre>
        )}
      </Card>
      {storage && (
        <Card>
          <h2 className="text-xl font-semibold">Storage allocation and usage</h2>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <dt>Allocated</dt>
            <dd>{(Number(storage.quotaBytes) / 1073741824).toFixed(2)} GiB</dd>
            <dt>Used</dt>
            <dd>{(Number(storage.usedBytes) / 1073741824).toFixed(2)} GiB</dd>
            <dt>Reserved for uploads</dt>
            <dd>{(Number(storage.reservedBytes) / 1073741824).toFixed(2)} GiB</dd>
            <dt>Capacity occupied</dt>
            <dd>{storage.percentageUsed}% (committed and reserved)</dd>
            <dt>Available</dt>
            <dd>{(Number(storage.availableBytes) / 1073741824).toFixed(2)} GiB</dd>
            <dt>Allocation source</dt>
            <dd>{storage.source}</dd>
            <dt>Threshold reached</dt>
            <dd>{storage.thresholdCrossed === null ? 'None' : `${storage.thresholdCrossed}%`}</dd>
            <dt>Measured</dt>
            <dd>{new Date(storage.measuredAt).toLocaleString()}</dd>
            <dt>Active members</dt>
            <dd>{usage?.userCount ?? 'Unavailable'}</dd>
          </dl>
          <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
            Customer file bytes include evidence attachments and uploaded resources in PostgreSQL or
            object storage. Database overhead, backups and temporary processing storage are
            operational usage and are not included here.
          </p>
          {formError && <ErrorNotice message={formError} />}
          <form onSubmit={updateQuota} className="mt-4 space-y-3">
            <label className="block">
              Storage override (GiB)
              <input
                type="number"
                min="0"
                step="0.01"
                value={quotaInput}
                onChange={(event) => setQuotaInput(event.target.value)}
                className="mt-1 block w-full"
              />
            </label>
            <p className="text-sm text-[var(--color-ink-muted)]">
              Leave blank to restore the effective resource profile allocation. Existing content is
              preserved when capacity is reduced.
            </p>
            <Button type="submit" disabled={busy}>
              {busy
                ? 'Saving…'
                : quotaInput === ''
                  ? 'Use resource profile allocation'
                  : 'Set storage override'}
            </Button>
          </form>
        </Card>
      )}

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
