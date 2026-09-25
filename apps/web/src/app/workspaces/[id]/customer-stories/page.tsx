'use client';

/**
 * Customer story moderation & publication (Phase 6, Track B) — the smallest
 * complete operational workflow to move a permitted testimonial candidate
 * from private feedback through moderation to public marketing evidence,
 * entirely inside Witness. Not a general-purpose CMS: plain text fields and
 * five actions (edit wording, approve, reject, publish, unpublish), grouped
 * into four compact lists.
 *
 * `customer_story:moderate` (edit/approve/reject) is an ordinary workspace
 * reviewer/admin capability. `customer_story:publish` is deliberately a
 * separate, platform-scope-only capability (see `authz/policy-enforcement
 * .service.ts`'s `PLATFORM_ONLY_ACTIONS`) — an organisation's own admin can
 * curate and approve a candidate but does not automatically gain publish
 * authority. The server tells this page whether the signed-in principal
 * holds that capability via `CustomerStoryView.canPublish`; the Publish/
 * Unpublish buttons are rendered only when it is true, and the server still
 * enforces this independently regardless of what the UI shows.
 */

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import type { CustomerStoryView } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { ProgramNav } from '@/components/program-nav';
import { Button, Card, EmptyState, ErrorNotice } from '@/components/ui';

const GROUPS = [
  { key: 'pending', title: 'Pending' },
  { key: 'approved', title: 'Approved' },
  { key: 'published', title: 'Published' },
  { key: 'rejected_withdrawn', title: 'Rejected / withdrawn' },
] as const;

type GroupKey = (typeof GROUPS)[number]['key'];

function groupFor(story: CustomerStoryView): GroupKey {
  if (story.moderationStatus === 'rejected' || story.consentWithdrawnAt !== null) {
    return 'rejected_withdrawn';
  }
  if (story.publishedAt !== null) return 'published';
  if (story.moderationStatus === 'approved') return 'approved';
  return 'pending';
}

function formatDate(value: string | null): string {
  if (value === null) return '—';
  return new Date(value).toLocaleString();
}

export default function CustomerStoriesModerationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: workspaceId } = use(params);
  const { user, ready } = useSession();
  const { currentUser } = useAuth();

  const [stories, setStories] = useState<CustomerStoryView[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [wordingDraft, setWordingDraft] = useState({
    quote: '',
    context: '',
    organisationLabel: '',
  });
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const role = currentUser?.workspaces.find((w) => w.id === workspaceId)?.role ?? null;

  const load = useCallback(async () => {
    try {
      const result = await api.listCustomerStories(workspaceId, user);
      setStories(result);
      setForbidden(false);
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        setForbidden(true);
      } else {
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId, user]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  function startEditing(story: CustomerStoryView) {
    setEditingId(story.id);
    setWordingDraft({
      quote: story.quote ?? story.rawQuote ?? '',
      context: story.context ?? '',
      organisationLabel: story.organisationLabel ?? '',
    });
  }

  async function saveWording(storyId: string) {
    setBusyId(storyId);
    setError(null);
    try {
      await api.editCustomerStoryWording(
        workspaceId,
        storyId,
        {
          quote: wordingDraft.quote,
          context: wordingDraft.context,
          organisationLabel:
            wordingDraft.organisationLabel.trim() === '' ? null : wordingDraft.organisationLabel,
        },
        user,
      );
      setEditingId(null);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusyId(null);
    }
  }

  async function approve(storyId: string) {
    setBusyId(storyId);
    setError(null);
    try {
      await api.moderateCustomerStory(workspaceId, storyId, { decision: 'approve' }, user);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(storyId: string) {
    setBusyId(storyId);
    setError(null);
    try {
      await api.moderateCustomerStory(
        workspaceId,
        storyId,
        { decision: 'reject', reason: rejectReason },
        user,
      );
      setRejectingId(null);
      setRejectReason('');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusyId(null);
    }
  }

  async function publish(storyId: string) {
    setBusyId(storyId);
    setError(null);
    try {
      await api.publishCustomerStory(workspaceId, storyId, user);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusyId(null);
    }
  }

  async function unpublish(storyId: string) {
    setBusyId(storyId);
    setError(null);
    try {
      await api.unpublishCustomerStory(workspaceId, storyId, user);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusyId(null);
    }
  }

  async function withdrawConsent(storyId: string) {
    setBusyId(storyId);
    setError(null);
    try {
      await api.withdrawCustomerStoryConsent(workspaceId, storyId, user);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <p role="status" className="text-[var(--color-ink-muted)]">
        Loading…
      </p>
    );
  }

  if (forbidden) {
    return (
      <div className="space-y-4">
        <Link href={`/workspaces/${workspaceId}`} className="inline-block text-sm underline">
          ← Back to program
        </Link>
        <ErrorNotice message="You don't have permission to view testimonial moderation for this program. Ask a program reviewer or administrator." />
      </div>
    );
  }

  const grouped = new Map<GroupKey, CustomerStoryView[]>(GROUPS.map((g) => [g.key, []]));
  for (const story of stories ?? []) {
    grouped.get(groupFor(story))!.push(story);
  }

  return (
    <div className="space-y-6">
      <Link href={`/workspaces/${workspaceId}`} className="inline-block text-sm underline">
        ← Back to program
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Customer stories</h1>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          Testimonial candidates raised from positive feedback. Approving a story does not publish
          it — publication requires a separately authorised platform capability, distinct from
          program moderation.
        </p>
      </div>

      <ProgramNav workspaceId={workspaceId} role={role} />

      {(stories ?? []).length === 0 ? (
        <EmptyState
          title="No testimonial candidates yet"
          body="Candidates appear here when someone gives positive feedback and consents to share their experience."
        />
      ) : (
        GROUPS.map(({ key, title }) => {
          const items = grouped.get(key) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={key} aria-labelledby={`group-${key}`} className="space-y-3">
              <h2 id={`group-${key}`} className="text-lg font-semibold">
                {title} ({items.length})
              </h2>
              <ul className="space-y-3">
                {items.map((story) => (
                  <li key={story.id}>
                    <Card className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="text-sm text-[var(--color-ink-muted)]">
                          <p>
                            {story.roleLabel} · {story.consentChoice}
                            {story.attributedName !== null && ` (${story.attributedName})`}
                            {story.organisationAttributionConsent && ' · org attribution permitted'}
                          </p>
                          <p>
                            Consent given {formatDate(story.consentGivenAt)}
                            {story.consentWithdrawnAt !== null &&
                              ` · withdrawn ${formatDate(story.consentWithdrawnAt)}`}
                          </p>
                          <p>
                            Moderation: {story.moderationStatus}
                            {story.moderatedByName !== null && ` by ${story.moderatedByName}`}
                            {story.moderationReason !== null && ` — ${story.moderationReason}`}
                          </p>
                          <p>Published: {formatDate(story.publishedAt)}</p>
                        </div>
                      </div>

                      {story.rawQuote !== null && (
                        <p className="text-sm italic text-[var(--color-ink-muted)]">
                          Original: &ldquo;{story.rawQuote}&rdquo;
                        </p>
                      )}

                      {editingId === story.id ? (
                        <div className="space-y-2">
                          <label className="block text-sm">
                            Public quote
                            <textarea
                              value={wordingDraft.quote}
                              onChange={(event) =>
                                setWordingDraft((prev) => ({ ...prev, quote: event.target.value }))
                              }
                              rows={2}
                              maxLength={1000}
                              className="mt-1 w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] p-2 text-sm"
                            />
                          </label>
                          <label className="block text-sm">
                            Context
                            <textarea
                              value={wordingDraft.context}
                              onChange={(event) =>
                                setWordingDraft((prev) => ({
                                  ...prev,
                                  context: event.target.value,
                                }))
                              }
                              rows={2}
                              maxLength={500}
                              className="mt-1 w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] p-2 text-sm"
                            />
                          </label>
                          <label className="block text-sm">
                            Organisation label{' '}
                            {!story.organisationAttributionConsent && (
                              <span className="text-[var(--color-ink-muted)]">
                                (not permitted — organisation attribution consent was not given)
                              </span>
                            )}
                            <input
                              type="text"
                              value={wordingDraft.organisationLabel}
                              disabled={!story.organisationAttributionConsent}
                              onChange={(event) =>
                                setWordingDraft((prev) => ({
                                  ...prev,
                                  organisationLabel: event.target.value,
                                }))
                              }
                              maxLength={200}
                              className="mt-1 w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] p-2 text-sm disabled:opacity-50"
                            />
                          </label>
                          <div className="flex gap-2">
                            <Button
                              variant="primary"
                              disabled={busyId === story.id}
                              onClick={() => void saveWording(story.id)}
                            >
                              Save wording
                            </Button>
                            <Button variant="secondary" onClick={() => setEditingId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm">
                            <strong>Quote:</strong> {story.quote ?? <em>not yet curated</em>}
                          </p>
                          <p className="text-sm">
                            <strong>Context:</strong> {story.context ?? <em>not yet curated</em>}
                          </p>
                          <p className="text-sm">
                            <strong>Organisation:</strong>{' '}
                            {story.organisationLabel ?? <em>not named</em>}
                          </p>
                        </>
                      )}

                      {rejectingId === story.id && (
                        <div className="space-y-2 border-t border-[var(--color-line)] pt-2">
                          <label className="block text-sm">
                            Rejection reason
                            <input
                              type="text"
                              value={rejectReason}
                              onChange={(event) => setRejectReason(event.target.value)}
                              className="mt-1 w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] p-2 text-sm"
                            />
                          </label>
                          <div className="flex gap-2">
                            <Button
                              variant="danger"
                              disabled={busyId === story.id || rejectReason.trim() === ''}
                              onClick={() => void reject(story.id)}
                            >
                              Confirm reject
                            </Button>
                            <Button variant="secondary" onClick={() => setRejectingId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 border-t border-[var(--color-line)] pt-2">
                        {story.moderationStatus !== 'rejected' && editingId !== story.id && (
                          <Button
                            variant="secondary"
                            disabled={busyId === story.id}
                            onClick={() => startEditing(story)}
                          >
                            Edit wording
                          </Button>
                        )}
                        {story.moderationStatus === 'pending' && (
                          <>
                            <Button
                              variant="primary"
                              disabled={
                                busyId === story.id ||
                                story.quote === null ||
                                story.context === null
                              }
                              onClick={() => void approve(story.id)}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="danger"
                              disabled={busyId === story.id}
                              onClick={() => setRejectingId(story.id)}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {story.canPublish &&
                          story.moderationStatus === 'approved' &&
                          story.consentWithdrawnAt === null &&
                          (story.publishedAt === null ? (
                            <Button
                              variant="primary"
                              disabled={busyId === story.id}
                              onClick={() => void publish(story.id)}
                            >
                              Publish
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              disabled={busyId === story.id}
                              onClick={() => void unpublish(story.id)}
                            >
                              Unpublish
                            </Button>
                          ))}
                        {story.consentWithdrawnAt === null && (
                          <Button
                            variant="secondary"
                            disabled={busyId === story.id}
                            onClick={() => void withdrawConsent(story.id)}
                          >
                            Withdraw consent
                          </Button>
                        )}
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
