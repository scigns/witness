'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { BillingInterval, PublicPlan } from '@witness/contracts';

function price(plan: PublicPlan, interval: BillingInterval): string {
  const found = plan.prices.find((candidate) => candidate.interval === interval);
  if (!found) return 'Contact us';
  if (found.amountMinor === 0) return 'Free';
  return `${found.startingFrom ? 'From ' : ''}${new Intl.NumberFormat('en-AU', { style: 'currency', currency: found.currency, maximumFractionDigits: 0 }).format(found.amountMinor / 100)}${interval === 'MONTHLY' ? '/month' : '/year'}`;
}

export function PricingCards({
  plans,
  interval,
  actionFor,
}: {
  plans: PublicPlan[];
  interval: BillingInterval;
  actionFor?: (plan: PublicPlan) => ReactNode;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan) => (
        <article
          key={plan.code}
          className="flex flex-col rounded-xl border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-5"
        >
          <h2 className="text-xl font-semibold">{plan.name}</h2>
          <p className="mt-2 min-h-16 text-sm text-[var(--color-ink-muted)]">{plan.description}</p>
          <p className="my-5 text-2xl font-semibold" aria-label={`${plan.name} price`}>
            {price(plan, interval)}
          </p>
          <ul className="mb-6 flex-1 space-y-2 text-sm">
            {plan.entitlements
              .filter((item) => item.value !== false)
              .slice(0, 7)
              .map((item) => (
                <li key={item.key}>
                  ✓{' '}
                  {typeof item.value === 'boolean'
                    ? item.description
                    : `${item.value}${item.unit ? ` ${item.unit}` : ''} — ${item.description}`}
                </li>
              ))}
          </ul>
          {actionFor ? (
            actionFor(plan)
          ) : (
            <Link
              href={plan.code === 'FREE' ? '/organisations/new' : '/signin'}
              className="rounded bg-[var(--color-accent)] px-4 py-2 text-center font-medium text-[var(--color-accent-contrast)]"
            >
              {plan.code === 'FREE'
                ? 'Start free'
                : plan.quoteBased
                  ? 'Request a quote'
                  : 'Choose plan'}
            </Link>
          )}
        </article>
      ))}
    </div>
  );
}
