'use client';
import { use, useCallback, useEffect, useState } from 'react';
import type {
  BillingInterval,
  BillingOverview,
  PaymentMethodChoice,
  PublicPlan,
} from '@witness/contracts';
import { PricingCards } from '@/components/pricing-cards';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function BillingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [interval, setInterval] = useState<BillingInterval>('MONTHLY');
  const [method, setMethod] = useState<PaymentMethodChoice>('CARD');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setOverview(await api.getBillingOverview(id, user));
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Billing could not be loaded.');
    }
  }, [id, user]);
  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);
  const request = async (plan: PublicPlan) => {
    setBusy(true);
    try {
      if (plan.code === 'INSTITUTIONAL') {
        await api.requestCommercialChange(
          id,
          {
            action: 'REQUEST_QUOTE',
            planCode: 'INSTITUTIONAL',
            idempotencyKey: crypto.randomUUID(),
          },
          user,
        );
      } else if (plan.code === 'FREE') {
        await api.requestCommercialChange(
          id,
          {
            action: 'CHANGE_PLAN',
            planCode: 'FREE',
            billingInterval: null,
            paymentMethod: null,
            idempotencyKey: crypto.randomUUID(),
          },
          user,
        );
      } else {
        await api.requestCommercialChange(
          id,
          {
            action: 'CHANGE_PLAN',
            planCode: plan.code,
            billingInterval: interval,
            paymentMethod: method,
            idempotencyKey: crypto.randomUUID(),
          },
          user,
        );
      }
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The request could not be recorded.');
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    setBusy(true);
    try {
      await api.requestCommercialChange(
        id,
        { action: 'CANCEL', idempotencyKey: crypto.randomUUID() },
        user,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The request could not be recorded.');
    } finally {
      setBusy(false);
    }
  };
  if (error && !overview) return <p role="alert">{error}</p>;
  if (!overview) return <p role="status">Loading billing…</p>;
  return (
    <div>
      <header className="mb-6">
        <p className="text-sm text-[var(--color-ink-muted)]">Organisation billing</p>
        <h1 className="text-3xl font-bold">{overview.currentPlan.name} plan</h1>
        <p>
          Status: {overview.subscription.status} · Frequency:{' '}
          {overview.subscription.billingInterval?.toLowerCase() ?? 'none'}
        </p>
      </header>
      {error && (
        <p role="alert" className="mb-4 text-red-700">
          {error}
        </p>
      )}
      {overview.pendingChange && (
        <div
          role="status"
          className="mb-6 rounded border border-[var(--color-line)] bg-[var(--color-accent-soft)] p-4"
        >
          Request pending:{' '}
          {overview.pendingChange.action === 'CANCEL'
            ? 'cancel at the end of the current period'
            : `${overview.pendingChange.requestedPlanCode} (${overview.pendingChange.billingInterval?.toLowerCase() ?? 'no billing interval'})`}
          . Your active plan has not changed.
        </div>
      )}
      <section aria-labelledby="usage-heading" className="mb-8">
        <h2 id="usage-heading" className="text-xl font-semibold">
          Usage
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-4">
          <Metric label="Users" value={overview.usage.userCount} />
          <Metric label="Programs" value={overview.usage.programCount} />
          <Metric label="Sessions" value={overview.usage.sessionCount} />
          <Metric
            label="Storage"
            value={`${(Number(overview.usage.storageBytes) / 1073741824).toFixed(2)} GB`}
          />
        </dl>
      </section>
      <section aria-labelledby="entitlements-heading" className="mb-8">
        <h2 id="entitlements-heading" className="text-xl font-semibold">
          Current entitlements
        </h2>
        <ul className="mt-3 columns-1 text-sm sm:columns-2">
          {overview.resolvedEntitlements
            .filter((item) => item.value !== false)
            .map((item) => (
              <li key={item.key} className="mb-2">
                {item.description}:{' '}
                <strong>
                  {item.value === true
                    ? 'Included'
                    : `${item.value}${item.unit ? ` ${item.unit}` : ''}`}
                </strong>
              </li>
            ))}
        </ul>
      </section>
      <section aria-labelledby="change-heading">
        <h2 id="change-heading" className="text-xl font-semibold">
          Change plan
        </h2>
        <div className="my-4 flex flex-wrap gap-6">
          <fieldset>
            <legend className="font-medium">Billing frequency</legend>
            {(['MONTHLY', 'YEARLY'] as const).map((value) => (
              <label key={value} className="mr-4">
                <input
                  type="radio"
                  checked={interval === value}
                  onChange={() => setInterval(value)}
                />{' '}
                {value === 'MONTHLY' ? 'Monthly' : 'Annual'}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend className="font-medium">Preferred payment method</legend>
            {(['CARD', 'BANK_TRANSFER', 'INVOICE'] as const).map((value) => (
              <label key={value} className="mr-4">
                <input type="radio" checked={method === value} onChange={() => setMethod(value)} />{' '}
                {value.replace('_', ' ').toLowerCase()}
              </label>
            ))}
          </fieldset>
        </div>
        <PricingCards
          plans={overview.availablePlans}
          interval={interval}
          actionFor={(plan) => (
            <button
              type="button"
              disabled={busy || (plan.code === 'FREE' && plan.code === overview.currentPlan.code)}
              onClick={() => void request(plan)}
              className="rounded bg-[var(--color-accent)] px-4 py-2 font-medium text-[var(--color-accent-contrast)] disabled:opacity-50"
            >
              {plan.code === overview.currentPlan.code
                ? plan.code === 'FREE'
                  ? 'Current plan'
                  : 'Update billing choice'
                : plan.code === 'FREE'
                  ? 'Request downgrade'
                  : plan.quoteBased
                    ? 'Request a quote'
                    : 'Request upgrade'}
            </button>
          )}
        />
        {overview.currentPlan.code !== 'FREE' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void cancel()}
            className="mt-6 text-sm text-red-700 underline"
          >
            Request cancellation
          </button>
        )}
      </section>
      <p className="mt-8 text-sm text-[var(--color-ink-muted)]">
        Requests do not activate paid service. Witness will confirm settlement or procurement
        separately.
      </p>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-[var(--color-line)] p-3">
      <dt className="text-sm text-[var(--color-ink-muted)]">{label}</dt>
      <dd className="text-xl font-semibold">{value}</dd>
    </div>
  );
}
