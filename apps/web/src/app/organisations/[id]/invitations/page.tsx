'use client';

/**
 * Organisation dashboard — Invitations.
 *
 * Invites a new Witness account into this organisation (ADR-0025: this
 * provisions the user, membership, and role all at once — there is no
 * separate "pending invitation" aggregate for organisation-level invites,
 * unlike `WorkspaceInvitation`). This page's list comes from
 * `OrganisationInvitationsService.listPending`, which reads accounts still
 * in `invited` state directly off the existing membership/role tables.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState, type FormEvent } from 'react';

import type {
  OrganisationInvitationView,
  OrganisationSummary,
  RoleDefinition,
  WitnessRole,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice } from '@/components/ui';
import { OrganisationNav } from '@/components/organisation-nav';

const NOTIFICATION_LABELS: Record<OrganisationInvitationView['notificationStatus'], string> = {
  pending: 'Not yet sent',
  sent: 'Sent',
  failed: 'Delivery failed',
};

export default function OrganisationInvitationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user, ready } = useSession();

  const [organisation, setOrganisation] = useState<OrganisationSummary | null>(null);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [pending, setPending] = useState<OrganisationInvitationView[]>([]);
  const [pendingUnavailable, setPendingUnavailable] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteDisplayName, setInviteDisplayName] = useState('');
  const [inviteRole, setInviteRole] = useState('');
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resendingUserId, setResendingUserId] = useState<string | null>(null);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const [organisationsResult, rolesResult] = await Promise.all([
          api.listOrganisations(user),
          api.listRoles(user),
        ]);
        if (cancelledRef.current) return;
        setOrganisation(organisationsResult.organisations.find((o) => o.id === id) ?? null);
        setRoles(rolesResult.roles);

        try {
          const pendingResult = await api.listPendingOrganisationInvitations(id, user);
          if (cancelledRef.current) return;
          setPending(pendingResult);
          setPendingUnavailable(false);
        } catch {
          if (cancelledRef.current) return;
          setPending([]);
          setPendingUnavailable(true);
        }

        setError(null);
      } catch (caught) {
        if (cancelledRef.current) return;
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    },
    [id, user],
  );

  useEffect(() => {
    if (!ready) return;

    const cancelledRef = { current: false };
    void load(cancelledRef);

    return () => {
      cancelledRef.current = true;
    };
  }, [ready, load]);

  const inviteUser = async (event: FormEvent) => {
    event.preventDefault();
    if (inviteRole === '') return;
    setBusy(true);
    setError(null);
    setInviteMessage(null);
    try {
      const invited = await api.inviteOrganisationUser(
        id,
        { email: inviteEmail, displayName: inviteDisplayName, role: inviteRole as WitnessRole },
        user,
      );
      setInviteEmail('');
      setInviteDisplayName('');
      setInviteRole('');
      setInviteMessage(
        `${invited.displayName} was added to this organisation as ${invited.role}. They can sign ` +
          `in once they authenticate with ${invited.email}. Notification: ${invited.notificationStatus}.`,
      );
      await load({ current: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const resend = async (invitation: OrganisationInvitationView) => {
    setResendingUserId(invitation.userId);
    setError(null);
    try {
      const result = await api.resendOrganisationInvitation(id, invitation.userId, user);
      setInviteMessage(`Invitation notification for ${invitation.email}: ${result.status}.`);
      await load({ current: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setResendingUserId(null);
    }
  };

  if (loading) {
    return (
      <p role="status" className="text-[var(--color-ink-muted)]">
        Loading…
      </p>
    );
  }

  if (organisation === null) {
    return (
      <div className="space-y-4">
        <ErrorNotice message={error ?? `No organisation with id '${id}'.`} />
        <Link href="/organisations" className="text-sm underline">
          ← Back to organisations
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/organisations" className="inline-block text-sm underline">
        ← Back to organisations
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <h1 className="text-2xl font-semibold tracking-tight">{organisation.name}</h1>

      <OrganisationNav organisationId={id} />

      <section aria-labelledby="invite-user-heading">
        <h2 id="invite-user-heading" className="mb-3 text-lg font-semibold">
          Invite a new person
        </h2>
        <Card className="space-y-4">
          {inviteMessage !== null && (
            <p className="text-sm text-[var(--color-ink)]" role="status">
              {inviteMessage}
            </p>
          )}
          <form onSubmit={(event) => void inviteUser(event)} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="inviteDisplayName" className="mb-1 block text-sm font-medium">
                  Name <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <input
                  id="inviteDisplayName"
                  required
                  maxLength={200}
                  value={inviteDisplayName}
                  onChange={(event) => setInviteDisplayName(event.target.value)}
                  placeholder="Mele Tupou"
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                />
              </div>
              <div>
                <label htmlFor="inviteEmail" className="mb-1 block text-sm font-medium">
                  Email <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <input
                  id="inviteEmail"
                  type="email"
                  required
                  maxLength={320}
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="mele@example.org"
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                />
              </div>
              <div>
                <label htmlFor="inviteRole" className="mb-1 block text-sm font-medium">
                  Role <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <select
                  id="inviteRole"
                  required
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                >
                  <option value="">Choose a role…</option>
                  {roles.map((definition) => (
                    <option
                      key={definition.role}
                      value={definition.role}
                      title={definition.description}
                    >
                      {definition.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Registers a Witness account, adds it to this organisation and assigns the chosen role,
              all at once. Witness sends onboarding instructions separately; activation still
              requires the identity provider to verify this exact email address.
            </p>
            <Button type="submit" variant="primary" disabled={busy || inviteRole === ''}>
              {busy ? 'Inviting…' : 'Invite to this organisation'}
            </Button>
          </form>
        </Card>
      </section>

      <section aria-labelledby="pending-heading">
        <h2 id="pending-heading" className="mb-3 text-lg font-semibold">
          Outstanding invitations
        </h2>
        {pendingUnavailable ? (
          <Card>
            <p className="text-sm text-[var(--color-ink-muted)]">
              Outstanding invitations aren&apos;t available to your role.
            </p>
          </Card>
        ) : pending.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-ink-muted)]">
              Nobody is waiting to activate an invitation right now.
            </p>
          </Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Accounts invited but not yet activated</caption>
              <thead>
                <tr className="border-b border-[var(--color-line)]">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Person
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Role
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Notification
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Invited
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {pending.map((invitation) => (
                  <tr key={invitation.userId} className="border-b border-[var(--color-line)]">
                    <td className="py-3 pr-4">
                      <div className="font-medium">{invitation.displayName}</div>
                      <div className="text-xs text-[var(--color-ink-muted)]">
                        {invitation.email}
                      </div>
                    </td>
                    <td className="py-3 pr-4">{invitation.role}</td>
                    <td className="py-3 pr-4">
                      {NOTIFICATION_LABELS[invitation.notificationStatus]}
                    </td>
                    <td className="py-3 pr-4 text-[var(--color-ink-muted)]">
                      {new Date(invitation.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3">
                      <Button
                        variant="secondary"
                        disabled={resendingUserId === invitation.userId}
                        onClick={() => void resend(invitation)}
                      >
                        {resendingUserId === invitation.userId ? 'Resending…' : 'Resend'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
