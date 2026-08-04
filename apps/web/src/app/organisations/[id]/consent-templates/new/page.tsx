'use client';

/**
 * Create a new consent template family (BUILD_ROADMAP.md Milestone 4,
 * Consent Management). Always creates version 1 as a draft — activation is
 * a separate step from the template detail page, matching the domain
 * lifecycle (`consent-template.ts`: draft → active → retired).
 *
 * `participation` is always included as a required category and cannot be
 * removed here — every template must gate on it (the one category every
 * other category decision is conditioned on), so the form does not offer a
 * way to violate that invariant only to have the server reject it.
 */

import { useRouter } from 'next/navigation';
import { use, useState, type FormEvent } from 'react';

import { WELL_KNOWN_CONSENT_CATEGORIES } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice } from '@/components/ui';

const CATEGORY_LABELS: Record<(typeof WELL_KNOWN_CONSENT_CATEGORIES)[number], string> = {
  participation: 'Participation',
  audio_recording: 'Audio recording',
  video_recording: 'Video recording',
  photography: 'Photography',
  transcription: 'Transcription',
  ai_processing: 'AI processing',
  attributed_quotation: 'Attributed quotation',
  anonymous_quotation: 'Anonymous quotation',
  internal_use: 'Internal organisational use',
  external_reporting: 'External reporting',
  publication: 'Publication',
  research_use: 'Research use',
  future_reuse: 'Future reuse',
  knowledge_graph_inclusion: 'Knowledge graph inclusion',
  follow_up_contact: 'Follow-up contact',
};

const OPTIONAL_CATEGORIES = WELL_KNOWN_CONSENT_CATEGORIES.filter((c) => c !== 'participation');

export default function NewConsentTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organisationId } = use(params);
  const router = useRouter();
  const { user } = useSession();

  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [plainLanguageSummary, setPlainLanguageSummary] = useState('');
  const [supportedLanguages, setSupportedLanguages] = useState('en');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(['audio_recording']),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleCategory = (category: string) => {
    setSelectedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const created = await api.createConsentTemplate(
        organisationId,
        {
          name,
          purpose,
          plainLanguageSummary,
          supportedLanguages: supportedLanguages
            .split(',')
            .map((l) => l.trim())
            .filter((l) => l.length > 0),
          categories: [
            { category: 'participation', required: true },
            ...[...selectedCategories].map((category) => ({ category, required: false })),
          ],
        },
        user,
      );
      router.push(`/organisations/${organisationId}/consent-templates/${created.id}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  const canSubmit =
    !busy &&
    name.trim() !== '' &&
    purpose.trim() !== '' &&
    plainLanguageSummary.trim() !== '' &&
    supportedLanguages.trim() !== '';

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New consent template</h1>
        <p className="mt-1 text-[var(--color-ink-muted)]">
          Consent to participate is always separate from consent to be recorded, quoted, published,
          or reused — choose which additional categories this template asks about.
        </p>
      </div>

      {error !== null && <ErrorNotice message={error} />}

      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        <Card className="space-y-4">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              Name <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="name"
              required
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Community Consultation Consent"
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </div>

          <div>
            <label htmlFor="purpose" className="mb-1 block text-sm font-medium">
              Purpose <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <textarea
              id="purpose"
              required
              maxLength={2000}
              rows={2}
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="Consent to participate in a community consultation workshop."
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </div>

          <div>
            <label htmlFor="plainLanguageSummary" className="mb-1 block text-sm font-medium">
              Plain-language summary <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <textarea
              id="plainLanguageSummary"
              required
              maxLength={5000}
              rows={3}
              value={plainLanguageSummary}
              onChange={(event) => setPlainLanguageSummary(event.target.value)}
              placeholder="We will ask what you think and may record it. You choose what we may use it for."
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
              Shown to participants before they decide. Write for a general audience, not a legal
              one.
            </p>
          </div>

          <div>
            <label htmlFor="supportedLanguages" className="mb-1 block text-sm font-medium">
              Supported languages (comma-separated) <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="supportedLanguages"
              required
              value={supportedLanguages}
              onChange={(event) => setSupportedLanguages(event.target.value)}
              placeholder="en, mi, sm"
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </div>

          <fieldset>
            <legend className="mb-2 block text-sm font-medium">Categories</legend>
            <p className="mb-2 text-xs text-[var(--color-ink-muted)]">
              &ldquo;Participation&rdquo; is always required and included automatically. Choose
              which other categories this template asks about — each session that uses this template
              decides which of these are required or optional.
            </p>
            <div className="flex flex-wrap items-center gap-2 rounded border border-[var(--color-line)] px-3 py-2 text-sm">
              <span className="inline-flex items-center gap-1 rounded-full border border-current px-2 py-0.5 text-xs font-medium text-[var(--color-ink-muted)]">
                Participation (always included)
              </span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {OPTIONAL_CATEGORIES.map((category) => (
                <label key={category} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedCategories.has(category)}
                    onChange={() => toggleCategory(category)}
                  />
                  {CATEGORY_LABELS[category]}
                </label>
              ))}
            </div>
          </fieldset>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            {busy ? 'Creating…' : 'Create template'}
          </Button>
        </div>
      </form>
    </div>
  );
}
