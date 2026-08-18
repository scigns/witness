'use client';

/**
 * Session consent configuration — attach a consent template to a session
 * and choose which of its categories are required or optional here
 * (BUILD_ROADMAP.md Milestone 4, Consent Management).
 *
 * Configuring (first attachment) and reconfiguring (replacing an existing
 * attachment) are separate server operations
 * (`SessionConsentConfigurationService.configure`/`.reconfigure`) — this
 * page uses one form for both, choosing which to call based on whether a
 * configuration was already loaded, since the fields involved are
 * identical from the facilitator's point of view.
 *
 * Only an *active* template may be attached (`consentTemplateActionSchema`'s
 * `activate` step in the template detail page) — the template picker below
 * is filtered to `status === 'active'` so a facilitator cannot select one
 * the server would reject anyway.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type {
  ConsentTemplateSummary,
  SessionConsentConfigurationView,
  SessionStatus,
} from '@witness/contracts';

const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  draft: 'draft',
  scheduled: 'scheduled',
  open: 'open',
  closed: 'closed',
  archived: 'archived',
};

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice, LinkButton } from '@/components/ui';

export default function SessionConsentConfigurationPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id: workspaceId, sessionId } = use(params);
  const { user, ready } = useSession();

  const [organisationId, setOrganisationId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [configuration, setConfiguration] = useState<SessionConsentConfigurationView | null>(null);
  const [templates, setTemplates] = useState<ConsentTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [staleUpdate, setStaleUpdate] = useState(false);

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateCategories, setTemplateCategories] = useState<
    { category: string; required: boolean }[]
  >([]);
  const [requiredCategories, setRequiredCategories] = useState<Set<string>>(
    new Set(['participation']),
  );
  const [optionalCategories, setOptionalCategories] = useState<Set<string>>(new Set());
  const [facilitatorInstructions, setFacilitatorInstructions] = useState('');
  const [participantIntroduction, setParticipantIntroduction] = useState('');

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const session = await api.getSession(workspaceId, sessionId, user);
        if (cancelledRef.current) return;
        setOrganisationId(session.organisationId);
        setSessionStatus(session.status);

        const templatesResult = await api.listConsentTemplates(session.organisationId, user);
        if (cancelledRef.current) return;
        const activeTemplates = templatesResult.templates.filter(
          (t) => t.status === 'active' && (t.workspaceId === null || t.workspaceId === workspaceId),
        );
        setTemplates(activeTemplates);

        try {
          const configurationResult = await api.getSessionConsentConfiguration(
            workspaceId,
            sessionId,
            user,
          );
          if (cancelledRef.current) return;
          setConfiguration(configurationResult);
          setSelectedTemplateId(configurationResult.consentTemplateId);
          setRequiredCategories(new Set(configurationResult.requiredCategories));
          setOptionalCategories(new Set(configurationResult.optionalCategories));
          setFacilitatorInstructions(configurationResult.facilitatorInstructions ?? '');
          setParticipantIntroduction(configurationResult.participantIntroduction ?? '');
        } catch (caught) {
          if (cancelledRef.current) return;
          if (!(caught instanceof ApiError && caught.code === 'SESSION_CONSENT_NOT_CONFIGURED')) {
            throw caught;
          }
          setConfiguration(null);
        }

        setError(null);
        setForbidden(false);
      } catch (caught) {
        if (cancelledRef.current) return;
        if (caught instanceof ApiError && caught.status === 403) {
          setForbidden(true);
        } else {
          setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
        }
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    },
    [workspaceId, sessionId, user],
  );

  useEffect(() => {
    if (!ready) return;
    const cancelledRef = { current: false };
    void load(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [ready, load]);

  useEffect(() => {
    const template = templates.find((t) => t.id === selectedTemplateId);
    if (template === undefined || organisationId === null) {
      setTemplateCategories([]);
      return;
    }
    void api.getConsentTemplate(organisationId, selectedTemplateId, user).then((detail) => {
      setTemplateCategories(detail.categories);
    });
  }, [selectedTemplateId, templates, organisationId, user]);

  const toggleCategory = (category: string, kind: 'required' | 'optional') => {
    if (category === 'participation') return;
    if (kind === 'required') {
      setRequiredCategories((current) => {
        const next = new Set(current);
        if (next.has(category)) next.delete(category);
        else next.add(category);
        return next;
      });
      setOptionalCategories((current) => {
        const next = new Set(current);
        next.delete(category);
        return next;
      });
    } else {
      setOptionalCategories((current) => {
        const next = new Set(current);
        if (next.has(category)) next.delete(category);
        else next.add(category);
        return next;
      });
      setRequiredCategories((current) => {
        const next = new Set(current);
        next.delete(category);
        return next;
      });
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    setStaleUpdate(false);

    const body = {
      consentTemplateId: selectedTemplateId,
      requiredCategories: [...requiredCategories],
      optionalCategories: [...optionalCategories],
      facilitatorInstructions:
        facilitatorInstructions.trim() === '' ? undefined : facilitatorInstructions,
      participantIntroduction:
        participantIntroduction.trim() === '' ? undefined : participantIntroduction,
    };

    try {
      const updated =
        configuration === null
          ? await api.configureSessionConsent(workspaceId, sessionId, body, user)
          : await api.reconfigureSessionConsent(
              workspaceId,
              sessionId,
              { ...body, expectedVersion: configuration.version },
              user,
            );
      setConfiguration(updated);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'STALE_VERSION') {
        setStaleUpdate(true);
      } else {
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      }
    } finally {
      setBusy(false);
    }
  };

  const reload = () => {
    setStaleUpdate(false);
    setLoading(true);
    void load({ current: false });
  };

  if (loading) {
    return <p className="text-[var(--color-ink-muted)]">Loading…</p>;
  }

  if (forbidden) {
    return (
      <div className="space-y-4">
        <ErrorNotice message="You do not have permission to view this session's consent configuration." />
        <Link
          href={`/workspaces/${workspaceId}/sessions/${sessionId}`}
          className="text-sm underline"
        >
          ← Back to session
        </Link>
      </div>
    );
  }

  // Mirrors the domain rule in `session-consent-configuration.ts`'s
  // `assertConfigurable` — configuring or reconfiguring consent is only
  // permitted while the session is `draft` or `scheduled`. Showing an
  // active Save button past that point would let a facilitator submit a
  // change the server can never legally accept.
  const configurable = sessionStatus === 'draft' || sessionStatus === 'scheduled';
  const canSubmit =
    configurable && !busy && selectedTemplateId !== '' && requiredCategories.has('participation');

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href={`/workspaces/${workspaceId}/sessions/${sessionId}`}
        className="inline-block text-sm underline"
      >
        ← Back to session
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      {staleUpdate && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-600 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          <span>This configuration was changed by someone else since you loaded it.</span>
          <Button variant="secondary" onClick={reload}>
            Reload
          </Button>
        </div>
      )}

      {!configurable && sessionStatus !== null && (
        <div
          role="status"
          className="rounded border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-4 text-sm"
        >
          <p className="font-medium">
            Read-only — this session is {SESSION_STATUS_LABELS[sessionStatus]}.
          </p>
          <p className="mt-1 text-[var(--color-ink-muted)]">
            Consent can only be configured while a session is draft or scheduled. Changing what
            consent is asked for after the session opens would invalidate decisions participants
            already made against the current configuration, so this is shown for reference only and
            cannot be saved.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Consent configuration</h1>
        <LinkButton href={`/workspaces/${workspaceId}/sessions/${sessionId}/consent-dashboard`}>
          Facilitator dashboard →
        </LinkButton>
      </div>

      {templates.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--color-ink-muted)]">
            No active consent template is available yet.{' '}
            {organisationId !== null && (
              <Link
                href={`/organisations/${organisationId}/consent-templates`}
                className="underline"
              >
                Create and activate one
              </Link>
            )}{' '}
            before configuring consent for this session.
          </p>
        </Card>
      ) : (
        <Card className="space-y-4">
          <fieldset disabled={!configurable} className="contents">
            <div>
              <label htmlFor="template" className="mb-1 block text-sm font-medium">
                Consent template <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </label>
              <select
                id="template"
                required
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              >
                <option value="">Choose a template…</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} (v{template.version})
                  </option>
                ))}
              </select>
            </div>

            {templateCategories.length > 0 && (
              <fieldset>
                <legend className="mb-2 block text-sm font-medium">
                  Categories for this session
                </legend>
                <div className="space-y-2">
                  {templateCategories.map((category) => (
                    <div
                      key={category.category}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <span>{category.category.replace(/_/g, ' ')}</span>
                      {category.category === 'participation' ? (
                        <span className="text-xs text-[var(--color-ink-muted)]">
                          Always required
                        </span>
                      ) : (
                        <div className="flex gap-3 text-xs">
                          <label className="flex items-center gap-1">
                            <input
                              type="radio"
                              name={`category-${category.category}`}
                              checked={requiredCategories.has(category.category)}
                              onChange={() => toggleCategory(category.category, 'required')}
                            />
                            Required
                          </label>
                          <label className="flex items-center gap-1">
                            <input
                              type="radio"
                              name={`category-${category.category}`}
                              checked={optionalCategories.has(category.category)}
                              onChange={() => toggleCategory(category.category, 'optional')}
                            />
                            Optional
                          </label>
                          <label className="flex items-center gap-1">
                            <input
                              type="radio"
                              name={`category-${category.category}`}
                              checked={
                                !requiredCategories.has(category.category) &&
                                !optionalCategories.has(category.category)
                              }
                              onChange={() => {
                                setRequiredCategories((c) => {
                                  const n = new Set(c);
                                  n.delete(category.category);
                                  return n;
                                });
                                setOptionalCategories((c) => {
                                  const n = new Set(c);
                                  n.delete(category.category);
                                  return n;
                                });
                              }}
                            />
                            Not asked
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </fieldset>
            )}

            <div>
              <label htmlFor="participantIntroduction" className="mb-1 block text-sm font-medium">
                Participant-facing introduction
              </label>
              <textarea
                id="participantIntroduction"
                maxLength={5000}
                rows={3}
                value={participantIntroduction}
                onChange={(event) => setParticipantIntroduction(event.target.value)}
                placeholder="Before we begin, we'd like to ask a few questions about how you're comfortable with us using what you share today."
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="facilitatorInstructions" className="mb-1 block text-sm font-medium">
                Facilitator instructions
              </label>
              <textarea
                id="facilitatorInstructions"
                maxLength={5000}
                rows={3}
                value={facilitatorInstructions}
                onChange={(event) => setFacilitatorInstructions(event.target.value)}
                placeholder="Read the introduction aloud, then capture each participant's decisions before the session opens."
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>
          </fieldset>

          {configurable && (
            <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
              {busy ? 'Saving…' : configuration === null ? 'Configure consent' : 'Save changes'}
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
