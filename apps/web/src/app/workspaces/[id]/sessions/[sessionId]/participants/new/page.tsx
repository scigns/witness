'use client';

/**
 * Add a participant to a co-design session (BUILD_ROADMAP.md Milestone 3).
 *
 * The registered/non-registered choice and the named/pseudonymous/anonymous
 * choice are independent controls, matching the domain model
 * (`session-participant.ts`): a registered Witness user can still
 * participate pseudonymously, and a non-registered person can still be
 * named. Choosing "Anonymous" hides every identity field — the server
 * forces them to a fixed, non-identifying value regardless of what this
 * form sends, but hiding them here avoids inviting a facilitator to type
 * something that will just be discarded.
 */

import { useRouter } from 'next/navigation';
import { use, useEffect, useState, type FormEvent } from 'react';

import {
  SUGGESTED_PARTICIPANT_TYPES,
  type MembershipState,
  type ParticipantIdentityMode,
  type ParticipationMode,
  type WorkspaceMembershipView,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice } from '@/components/ui';

const GOOD_STANDING: ReadonlySet<MembershipState> = new Set<MembershipState>(['invited', 'active']);

const PARTICIPATION_MODE_LABELS: Record<ParticipationMode, string> = {
  in_person: 'In person',
  online: 'Online',
  hybrid: 'Hybrid',
  asynchronous: 'Asynchronous',
  proxy: 'Proxy or representative',
  other: 'Other',
};

const PARTICIPANT_TYPE_LABELS: Record<(typeof SUGGESTED_PARTICIPANT_TYPES)[number], string> = {
  facilitator: 'Facilitator',
  participant: 'Participant',
  community_representative: 'Community representative',
  government_representative: 'Government representative',
  civil_society_representative: 'Civil society representative',
  researcher: 'Researcher',
  subject_matter_expert: 'Subject-matter expert',
  interpreter: 'Interpreter',
  observer: 'Observer',
  note_taker: 'Note-taker',
  other: 'Other (name it below)',
};

const IDENTITY_MODE_LABELS: Record<ParticipantIdentityMode, string> = {
  named: 'Named — a real name is recorded',
  pseudonymous: 'Pseudonymous — a chosen name is shown, real identity kept restricted',
  anonymous: 'Anonymous — no identifying details are recorded at all',
};

export default function NewParticipantPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id: workspaceId, sessionId } = use(params);
  const router = useRouter();
  const { user, ready } = useSession();

  const [members, setMembers] = useState<WorkspaceMembershipView[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  // `workspace_membership:read` is admin-only (least privilege, see
  // `role-grants.ts`) — most roles adding a participant here legitimately
  // can't list the roster. That only affects the optional "link an
  // existing registered user" path; a non-registered participant can still
  // be added normally, so this must not surface as a page-level error.
  const [membersForbidden, setMembersForbidden] = useState(false);

  const [isRegistered, setIsRegistered] = useState(false);
  const [linkedUserId, setLinkedUserId] = useState('');
  const [identityMode, setIdentityMode] = useState<ParticipantIdentityMode>('named');
  const [displayName, setDisplayName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [participantTypeChoice, setParticipantTypeChoice] =
    useState<(typeof SUGGESTED_PARTICIPANT_TYPES)[number]>('participant');
  const [customParticipantType, setCustomParticipantType] = useState('');
  const [participationMode, setParticipationMode] = useState<ParticipationMode>('in_person');
  const [languagePreference, setLanguagePreference] = useState('');
  const [accessibilityRequirements, setAccessibilityRequirements] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    void (async () => {
      setLoadingMembers(true);
      try {
        const result = await api.listWorkspaceMemberships(workspaceId, user);
        if (cancelled) return;
        setMembers(result.memberships.filter((member) => GOOD_STANDING.has(member.state)));
        setMembersForbidden(false);
      } catch {
        if (cancelled) return;
        setMembers([]);
        setMembersForbidden(true);
      } finally {
        if (!cancelled) setLoadingMembers(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, workspaceId, user]);

  const isAnonymous = identityMode === 'anonymous';
  const participantType =
    participantTypeChoice === 'other' ? customParticipantType.trim() : participantTypeChoice;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const created = await api.addParticipant(
        workspaceId,
        sessionId,
        {
          linkedUserId: isRegistered && linkedUserId !== '' ? linkedUserId : undefined,
          displayName: isAnonymous ? undefined : displayName,
          preferredName: isAnonymous || preferredName.trim() === '' ? undefined : preferredName,
          pronouns: isAnonymous || pronouns.trim() === '' ? undefined : pronouns,
          affiliation: isAnonymous || affiliation.trim() === '' ? undefined : affiliation,
          participantType,
          participationMode,
          identityMode,
          languagePreference: languagePreference.trim() === '' ? undefined : languagePreference,
          accessibilityRequirements:
            accessibilityRequirements.trim() === '' ? undefined : accessibilityRequirements,
        },
        user,
      );
      router.push(`/workspaces/${workspaceId}/sessions/${sessionId}/participants/${created.id}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  const canSubmit =
    !busy &&
    participantType.trim() !== '' &&
    (isAnonymous || displayName.trim() !== '') &&
    (!isRegistered || linkedUserId !== '');

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Add a participant</h1>
        <p className="mt-1 text-[var(--color-ink-muted)]">
          A participant does not need a Witness account — named, pseudonymous, and anonymous
          participation are all supported.
        </p>
      </div>

      {error !== null && <ErrorNotice message={error} />}

      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        <Card className="space-y-4">
          <fieldset>
            <legend className="mb-1 block text-sm font-medium">Registration</legend>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="registration"
                  checked={!isRegistered}
                  onChange={() => {
                    setIsRegistered(false);
                    setLinkedUserId('');
                  }}
                />
                Non-registered participant
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="registration"
                  checked={isRegistered}
                  disabled={isAnonymous || membersForbidden}
                  onChange={() => setIsRegistered(true)}
                />
                Registered Witness user
              </label>
            </div>
            {isAnonymous && (
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                Anonymous participation cannot be linked to a registered account.
              </p>
            )}
            {!isAnonymous && membersForbidden && (
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                You don't have permission to browse this program's roster, so this participant will
                be added as non-registered. Ask an organisation admin to link an existing account if
                needed.
              </p>
            )}
          </fieldset>

          {isRegistered && (
            <div>
              <label htmlFor="linkedUserId" className="mb-1 block text-sm font-medium">
                Workspace member <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </label>
              <select
                id="linkedUserId"
                required
                disabled={loadingMembers}
                value={linkedUserId}
                onChange={(event) => setLinkedUserId(event.target.value)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              >
                <option value="">{loadingMembers ? 'Loading…' : 'Choose a member…'}</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.userDisplayName} ({member.userEmail})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="identityMode" className="mb-1 block text-sm font-medium">
              Identity mode <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <select
              id="identityMode"
              value={identityMode}
              onChange={(event) => {
                const mode = event.target.value as ParticipantIdentityMode;
                setIdentityMode(mode);
                if (mode === 'anonymous') {
                  setIsRegistered(false);
                  setLinkedUserId('');
                }
              }}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            >
              {(['named', 'pseudonymous', 'anonymous'] as const).map((mode) => (
                <option key={mode} value={mode}>
                  {IDENTITY_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </div>

          {!isAnonymous && (
            <>
              <div>
                <label htmlFor="displayName" className="mb-1 block text-sm font-medium">
                  {identityMode === 'pseudonymous' ? 'Pseudonym' : 'Display name'}{' '}
                  <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <input
                  id="displayName"
                  required
                  maxLength={200}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={identityMode === 'pseudonymous' ? 'River' : 'Aroha Ngata'}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="preferredName" className="mb-1 block text-sm font-medium">
                    Preferred name
                  </label>
                  <input
                    id="preferredName"
                    maxLength={200}
                    value={preferredName}
                    onChange={(event) => setPreferredName(event.target.value)}
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                  />
                </div>
                <div>
                  <label htmlFor="pronouns" className="mb-1 block text-sm font-medium">
                    Pronouns
                  </label>
                  <input
                    id="pronouns"
                    maxLength={50}
                    value={pronouns}
                    onChange={(event) => setPronouns(event.target.value)}
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="affiliation" className="mb-1 block text-sm font-medium">
                  Organisation or community affiliation
                </label>
                <input
                  id="affiliation"
                  maxLength={300}
                  value={affiliation}
                  onChange={(event) => setAffiliation(event.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                />
              </div>
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="participantType" className="mb-1 block text-sm font-medium">
                Participant type <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </label>
              <select
                id="participantType"
                value={participantTypeChoice}
                onChange={(event) =>
                  setParticipantTypeChoice(
                    event.target.value as (typeof SUGGESTED_PARTICIPANT_TYPES)[number],
                  )
                }
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              >
                {SUGGESTED_PARTICIPANT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {PARTICIPANT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                Not on the list? Choose &ldquo;Other&rdquo; and name it — participant type is free
                text, not a fixed set. This is not a system permission.
              </p>
            </div>
            <div>
              <label htmlFor="participationMode" className="mb-1 block text-sm font-medium">
                Participation mode <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </label>
              <select
                id="participationMode"
                value={participationMode}
                onChange={(event) => setParticipationMode(event.target.value as ParticipationMode)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              >
                {Object.entries(PARTICIPATION_MODE_LABELS).map(([mode, label]) => (
                  <option key={mode} value={mode}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {participantTypeChoice === 'other' && (
            <div>
              <label htmlFor="customParticipantType" className="mb-1 block text-sm font-medium">
                Name this participant type <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </label>
              <input
                id="customParticipantType"
                required
                maxLength={100}
                value={customParticipantType}
                onChange={(event) => setCustomParticipantType(event.target.value)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="languagePreference" className="mb-1 block text-sm font-medium">
                Language preference
              </label>
              <input
                id="languagePreference"
                maxLength={50}
                value={languagePreference}
                onChange={(event) => setLanguagePreference(event.target.value)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="accessibilityRequirements" className="mb-1 block text-sm font-medium">
                Accessibility requirements
              </label>
              <input
                id="accessibilityRequirements"
                maxLength={2000}
                value={accessibilityRequirements}
                onChange={(event) => setAccessibilityRequirements(event.target.value)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>
          </div>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            {busy ? 'Adding…' : 'Add participant'}
          </Button>
        </div>
      </form>
    </div>
  );
}
