'use client';

import Link from 'next/link';
import { use, useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  BillingInterval,
  CommercialChangeView,
  InvoiceCurrency,
  InvoiceView,
} from '@witness/contracts';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice } from '@/components/ui';

type Context = Awaited<ReturnType<typeof api.getOperatorOrigination>>;

export default function OriginationPage({
  params,
}: {
  params: Promise<{ organisationId: string }>;
}) {
  const { organisationId } = use(params);
  const { user, ready } = useSession();
  const [context, setContext] = useState<Context | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceView | null>(null);
  const [planCode, setPlanCode] = useState('');
  const [interval, setInterval] = useState<BillingInterval>('YEARLY');
  const [legalName, setLegalName] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [reference, setReference] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [tax, setTax] = useState('0');
  // Keep request identities through network failures. Changed values require a fresh request.
  const attempt = useRef<{
    fingerprint: string;
    changeKey: string;
    invoiceKey: string;
    change: CommercialChangeView | null;
  } | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void api
      .getOperatorOrigination(organisationId, user)
      .then((result) => {
        if (cancelled) return;
        setContext(result);
        setLegalName(result.organisation.name);
      })
      .catch((caught) => {
        if (!cancelled)
          setError(caught instanceof ApiError ? caught.message : 'Onboarding context unavailable.');
      });
    return () => {
      cancelled = true;
    };
  }, [organisationId, ready, user]);

  const plans =
    context?.billing.availablePlans.filter(
      (plan) =>
        !plan.quoteBased &&
        plan.prices.some(
          (price) => price.amountMinor > 0 && price.currency === context.billingAccount.currency,
        ),
    ) ?? [];
  const plan = plans.find((candidate) => candidate.code === planCode);
  const price = plan?.prices.find(
    (candidate) =>
      candidate.interval === interval && candidate.currency === context?.billingAccount.currency,
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!context || !plan || !price || price.amountMinor <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const fingerprint = JSON.stringify([
        plan.code,
        interval,
        legalName,
        address,
        email,
        reference,
        dueDate,
        tax,
      ]);
      if (attempt.current && attempt.current.fingerprint !== fingerprint)
        throw new Error(
          'An issuance attempt already exists. Reopen this page to review the pending request before changing invoice details.',
        );
      const current = (attempt.current ??= {
        fingerprint,
        changeKey: crypto.randomUUID(),
        invoiceKey: crypto.randomUUID(),
        change: null,
      });
      const pending = context.billing.pendingChange;
      if (
        pending &&
        (pending.action !== 'CHANGE_PLAN' ||
          pending.requestedPlanCode !== plan.code ||
          pending.billingInterval !== interval ||
          pending.paymentMethod === 'CARD')
      )
        throw new Error(
          'A different commercial request is pending. Resolve it before issuing this invoice.',
        );
      // Only non-quoted paid catalogue plans are offered. The server validates price and state again.
      const change = (current.change ??=
        pending ??
        (await api.requestOperatorCommercialChange(
          organisationId,
          {
            action: 'CHANGE_PLAN',
            planCode: plan.code as 'TEAM' | 'ORGANISATION',
            billingInterval: interval,
            paymentMethod: 'BANK_TRANSFER',
            idempotencyKey: current.changeKey,
          },
          user,
        )));
      setInvoice(
        await api.issueOperatorInvoice(
          organisationId,
          {
            idempotencyKey: current.invoiceKey,
            billingAccountId: context.billingAccount.id,
            commercialChangeRequestId: change.id,
            currency: context.billingAccount.currency as InvoiceCurrency,
            customer: { legalName, address, ...(email ? { email } : {}) },
            customerReference: reference,
            dueAt: new Date(`${dueDate}T23:59:59Z`).toISOString(),
            lines: [
              {
                description: `${plan.name} subscription — ${interval.toLowerCase()}. ${reference}`,
                quantity: '1',
                unitAmountMinor: String(price.amountMinor),
                taxRateBasisPoints: Number(tax),
              },
            ],
          },
          user,
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Invoice could not be issued.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Commercial onboarding</h1>
      {error && <ErrorNotice message={error} />}
      {!context && !error && <p role="status">Loading organisation billing…</p>}
      {context && (
        <>
          <p>
            {context.organisation.name} · Subscription: {context.billing.subscription.status}
          </p>
          <Link
            href={`/operations/organisations/${organisationId}/commercial-configuration`}
            className="underline"
          >
            Review negotiated entitlements, allocation and usage
          </Link>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Issue an invoice at the approved catalogue price. Quoted plans require an approved
            origination workflow and are not offered here. Confirm the contracted isolation can
            actually be provided before issuing.
          </p>
          {invoice ? (
            <Card>
              <h2 className="text-xl font-semibold">Invoice issued: {invoice.invoiceNumber}</h2>
              <p>
                {invoice.currency} {invoice.totalMinor} minor units · {invoice.status}
              </p>
              <p>Paid access activates only after verified settlement.</p>
              <Link
                href={`/operations/organisations/${organisationId}/invoices/${invoice.id}/settle`}
                className="underline"
              >
                Record received payment and activate subscription
              </Link>
            </Card>
          ) : (
            <Card>
              <form onSubmit={(event) => void submit(event)} className="space-y-4">
                <label className="block">
                  Plan
                  <select
                    required
                    value={planCode}
                    onChange={(event) => setPlanCode(event.target.value)}
                    className="mt-1 block w-full rounded border p-2"
                  >
                    <option value="">Select a paid plan</option>
                    {plans.map((candidate) => (
                      <option key={candidate.code} value={candidate.code}>
                        {candidate.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  Billing interval
                  <select
                    value={interval}
                    onChange={(event) => setInterval(event.target.value as BillingInterval)}
                    className="mt-1 block w-full rounded border p-2"
                  >
                    <option value="YEARLY">Annual</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </label>
                <p>
                  Catalogue subtotal:{' '}
                  {price
                    ? `${price.currency} ${price.amountMinor} minor units`
                    : 'Select a supported plan and interval'}
                </p>
                <label className="block">
                  Customer legal name
                  <input
                    required
                    maxLength={200}
                    value={legalName}
                    onChange={(event) => setLegalName(event.target.value)}
                    className="mt-1 block w-full rounded border p-2"
                  />
                </label>
                <label className="block">
                  Billing address
                  <textarea
                    required
                    maxLength={1000}
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    className="mt-1 block w-full rounded border p-2"
                  />
                </label>
                <label className="block">
                  Billing email
                  <input
                    type="email"
                    maxLength={320}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-1 block w-full rounded border p-2"
                  />
                </label>
                <label className="block">
                  Agreement / customer reference
                  <input
                    required
                    maxLength={200}
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    className="mt-1 block w-full rounded border p-2"
                  />
                </label>
                <label className="block">
                  Payment due date
                  <input
                    required
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                    className="mt-1 block w-full rounded border p-2"
                  />
                </label>
                <label className="block">
                  Tax rate (basis points; 1000 = 10%)
                  <input
                    required
                    type="number"
                    min={0}
                    max={10000}
                    step={1}
                    value={tax}
                    onChange={(event) => setTax(event.target.value)}
                    className="mt-1 block w-full rounded border p-2"
                  />
                </label>
                <Button type="submit" disabled={busy || !price}>
                  {busy ? 'Issuing…' : 'Issue invoice'}
                </Button>
              </form>
            </Card>
          )}
          <section>
            <h2 className="text-xl font-semibold">Existing invoices</h2>
            <ul className="mt-3 space-y-2">
              {context.billing.invoices.map((existing) => (
                <li key={existing.id}>
                  <Link
                    className="underline"
                    href={`/operations/organisations/${organisationId}/invoices/${existing.id}/settle`}
                  >
                    {existing.invoiceNumber} · {existing.status}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
