'use client';
import { useEffect, useState } from 'react';
import type { BillingInterval, PublicPlanCatalogue } from '@witness/contracts';
import { PricingCards } from '@/components/pricing-cards';
import { api } from '@/lib/api';

export default function PricingPage() {
  const [catalogue, setCatalogue] = useState<PublicPlanCatalogue | null>(null);
  const [interval, setInterval] = useState<BillingInterval>('MONTHLY');
  const [error, setError] = useState(false);
  useEffect(() => {
    void api
      .getPlanCatalogue()
      .then(setCatalogue)
      .catch(() => setError(true));
  }, []);
  return (
    <div>
      <header className="mb-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-[var(--color-accent)]">
          Simple AUD pricing
        </p>
        <h1 className="mt-2 text-4xl font-bold">Keep institutional memory accountable</h1>
        <p className="mx-auto mt-3 max-w-2xl text-[var(--color-ink-muted)]">
          Start free. Upgrade when your team needs more capacity, governance or deployment control.
        </p>
      </header>
      <fieldset className="mb-8 flex justify-center gap-4">
        <legend className="sr-only">Billing frequency</legend>
        {(['MONTHLY', 'YEARLY'] as const).map((value) => (
          <label key={value} className="cursor-pointer">
            <input
              type="radio"
              name="interval"
              value={value}
              checked={interval === value}
              onChange={() => setInterval(value)}
            />{' '}
            <span>{value === 'MONTHLY' ? 'Monthly' : 'Annual'}</span>
          </label>
        ))}
      </fieldset>
      {error && <p role="alert">Pricing is temporarily unavailable. Please try again later.</p>}
      {!catalogue && !error && <p role="status">Loading pricing…</p>}
      {catalogue && <PricingCards plans={catalogue.plans} interval={interval} />}
      <p className="mt-8 text-center text-sm text-[var(--color-ink-muted)]">
        Prices are in Australian dollars. Paid changes are requests until payment or procurement is
        confirmed. Institutional pricing is quote-based; requesting a quote is not a purchase or
        activation.
      </p>
    </div>
  );
}
