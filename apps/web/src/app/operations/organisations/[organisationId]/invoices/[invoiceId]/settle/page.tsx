'use client';

import { use, useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  InvoiceCurrency,
  ManualSettlementContextView,
  ManualSettlementResultView,
} from '@witness/contracts';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card } from '@/components/ui';

export default function SettleInvoicePage({
  params,
}: {
  params: Promise<{ organisationId: string; invoiceId: string }>;
}) {
  const { organisationId, invoiceId } = use(params);
  const { user, ready } = useSession();
  const [context, setContext] = useState<ManualSettlementContextView | null>(null);
  const [result, setResult] = useState<ManualSettlementResultView | null>(null);
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 16));
  const [sourceReference, setSourceReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    void api
      .getManualSettlementContext(organisationId, invoiceId, user)
      .then(setContext)
      .catch((caught) =>
        setError(caught instanceof ApiError ? caught.message : 'Settlement context unavailable.'),
      );
  }, [invoiceId, organisationId, ready, user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!context) return;
    setBusy(true);
    setError(null);
    try {
      setResult(
        await api.recordManualSettlement(
          organisationId,
          invoiceId,
          {
            amountMinor: context.invoice.totalMinor,
            currency: context.invoice.currency as InvoiceCurrency,
            receivedAt: new Date(receivedAt).toISOString(),
            paymentMethod: 'MANUAL_BANK_TRANSFER',
            sourceReference,
            idempotencyKey: (idempotencyKey.current ??= crypto.randomUUID()),
          },
          user,
        ),
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Settlement could not be recorded.');
    } finally {
      setBusy(false);
    }
  };

  if (error && !context) return <p role="alert">{error}</p>;
  if (!context) return <p role="status">Loading settlement…</p>;
  if (result) {
    return (
      <div className="space-y-6">
        <header>
          <p className="text-sm text-[var(--color-ink-muted)]">Commercial operations</p>
          <h1 className="text-3xl font-bold">Payment recorded</h1>
        </header>
        <Card>
          <dl className="grid gap-3 sm:grid-cols-2">
            <dt>Invoice</dt>
            <dd>{result.invoice.status}</dd>
            <dt>Subscription</dt>
            <dd>{result.subscription.status}</dd>
            <dt>Plan</dt>
            <dd>{result.plan.name}</dd>
            <dt>Effective</dt>
            <dd>{new Date(result.effectiveAt).toLocaleString()}</dd>
          </dl>
        </Card>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-[var(--color-ink-muted)]">Commercial operations</p>
        <h1 className="text-3xl font-bold">Settle {context.invoice.invoiceNumber}</h1>
        <p>Confirm only after independently verifying that external funds arrived.</p>
      </header>
      <Card>
        <p>Customer: {context.invoice.customer.legalName}</p>
        <p>Plan: {context.requestedPlan.name}</p>
        <p>Invoice: {context.invoice.status}</p>
        <p>
          Total: {context.invoice.currency} {context.invoice.totalMinor}
        </p>
      </Card>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          Amount (minor units)
          <input value={context.invoice.totalMinor} disabled className="mt-1 block w-full" />
        </label>
        <label className="block">
          Currency
          <input value={context.invoice.currency} disabled className="mt-1 block w-full" />
        </label>
        <label className="block">
          Received date and time
          <input
            type="datetime-local"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
            required
            className="mt-1 block w-full"
          />
        </label>
        <label className="block">
          Transaction/reference
          <input
            value={sourceReference}
            onChange={(e) => setSourceReference(e.target.value)}
            required
            maxLength={200}
            className="mt-1 block w-full"
          />
        </label>
        <Button type="submit" disabled={busy} variant="primary">
          {busy ? 'Recording…' : 'Confirm settlement'}
        </Button>
      </form>
    </div>
  );
}
