'use client';

/**
 * Facilitator-facing "generate a QR/join link" panel (Phase 5, Workstream
 * 1.6) — the piece that makes governed QR joining actually reachable from
 * the product rather than only via direct API calls.
 *
 * The raw token is only ever returned once, at creation
 * (`SessionJoinLinkCreatedView`, never `SessionJoinLinkView`) — the same
 * "never re-servable, mint a new one instead" discipline the API's own
 * token design already commits to. This panel therefore only ever renders
 * a QR code for a link it just created in this browser session; the roster
 * below it (existing links, from the list endpoint) shows status and
 * governance mode but never a scannable code, by construction.
 */

import { useCallback, useEffect, useState } from 'react';

import type { SessionJoinGovernanceMode, SessionJoinLinkView } from '@witness/contracts';
import { SESSION_JOIN_GOVERNANCE_MODES } from '@witness/contracts';

import { api, ApiError, type ActingUser } from '@/lib/api';
import { Button, Card, ErrorNotice } from '@/components/ui';

const GOVERNANCE_MODE_LABELS: Record<SessionJoinGovernanceMode, string> = {
  invited_only: 'Invited only (must already have workspace access)',
  verified_guest: 'Verified guest (must sign in, no prior access needed)',
  pseudonymous: 'Pseudonymous (choose a name, no sign-in)',
  anonymous: 'Anonymous (no name, no sign-in)',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function SessionJoinLinksPanel({
  workspaceId,
  sessionId,
  user,
}: {
  workspaceId: string;
  sessionId: string;
  user: ActingUser;
}) {
  const [links, setLinks] = useState<SessionJoinLinkView[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [governanceMode, setGovernanceMode] = useState<SessionJoinGovernanceMode>('anonymous');
  const [expiresInMinutes, setExpiresInMinutes] = useState(240);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdJoinUrl, setCreatedJoinUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const loadLinks = useCallback(async () => {
    try {
      const result = await api.listSessionJoinLinks(workspaceId, sessionId, user);
      setLinks(result);
      setListError(null);
    } catch (caught) {
      setListError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    }
  }, [workspaceId, sessionId, user]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  const generate = async () => {
    setCreating(true);
    setCreateError(null);
    setCreatedJoinUrl(null);
    setQrDataUrl(null);
    try {
      const created = await api.createSessionJoinLink(
        workspaceId,
        sessionId,
        { governanceMode, expiresInMinutes },
        user,
      );
      const joinUrl = `${window.location.origin}${created.joinPath}`;
      setCreatedJoinUrl(joinUrl);
      const QRCode = await import('qrcode');
      setQrDataUrl(await QRCode.toDataURL(joinUrl, { width: 320, margin: 2 }));
      await loadLinks();
    } catch (caught) {
      setCreateError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (linkId: string) => {
    try {
      await api.revokeSessionJoinLink(workspaceId, sessionId, linkId, user);
      await loadLinks();
    } catch (caught) {
      setListError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    }
  };

  return (
    <section aria-labelledby="join-links-heading" className="space-y-3">
      <div>
        <h2 id="join-links-heading" className="text-lg font-semibold">
          QR / join links
        </h2>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Generate a link a participant reaches by scanning a QR code, with no facilitator typing
          their name in. Choose how much identity a scan requires before it counts as joined.
        </p>
      </div>

      <Card className="space-y-4">
        {createError !== null && <ErrorNotice message={createError} />}

        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">
            <span className="block font-medium text-[var(--color-ink)]">Who can join</span>
            <select
              value={governanceMode}
              onChange={(event) =>
                setGovernanceMode(event.target.value as SessionJoinGovernanceMode)
              }
              className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-2 py-1.5 text-sm"
            >
              {SESSION_JOIN_GOVERNANCE_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {GOVERNANCE_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="block font-medium text-[var(--color-ink)]">Expires after</span>
            <select
              value={expiresInMinutes}
              onChange={(event) => setExpiresInMinutes(Number(event.target.value))}
              className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-2 py-1.5 text-sm"
            >
              <option value={60}>1 hour</option>
              <option value={240}>4 hours</option>
              <option value={480}>8 hours</option>
              <option value={1440}>24 hours</option>
            </select>
          </label>

          <Button variant="primary" disabled={creating} onClick={() => void generate()}>
            {creating ? 'Generating…' : 'Generate join link'}
          </Button>
        </div>

        {createdJoinUrl !== null && qrDataUrl !== null && (
          <div className="flex flex-col items-center gap-3 border-t border-[var(--color-line)] pt-4">
            {/* A data: URI generated client-side — next/image gains nothing here. */}
            <img src={qrDataUrl} alt="QR code to join this session" width={200} height={200} />
            <p className="max-w-sm text-center text-xs text-[var(--color-ink-muted)]">
              Shown once — this is the only time this page shows this code. Screenshot or print it
              now; revoke and generate a new one if it&rsquo;s lost.
            </p>
            <code className="max-w-full break-all rounded bg-[var(--color-paper)] px-2 py-1 text-xs">
              {createdJoinUrl}
            </code>
          </div>
        )}
      </Card>

      {listError !== null && <ErrorNotice message={listError} />}

      {links.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)] text-[var(--color-ink-muted)]">
                <th className="py-2 pr-4 font-medium">Mode</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Uses</th>
                <th className="py-2 pr-4 font-medium">Expires</th>
                <th className="py-2 pr-4 font-medium">Created by</th>
                <th className="py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="py-2 pr-4">{GOVERNANCE_MODE_LABELS[link.governanceMode]}</td>
                  <td className="py-2 pr-4">{link.status}</td>
                  <td className="py-2 pr-4">
                    {link.useCount}
                    {link.maxUses !== null ? ` / ${link.maxUses}` : ''}
                  </td>
                  <td className="py-2 pr-4">{formatDate(link.expiresAt)}</td>
                  <td className="py-2 pr-4">{link.createdByDisplayName}</td>
                  <td className="py-2">
                    {link.status === 'active' && (
                      <Button variant="secondary" onClick={() => void revoke(link.id)}>
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
