/**
 * Export renderers (BUILD_ROADMAP.md Milestone 8).
 *
 * These functions take a `RenderedReport` — which has *already* passed
 * through server-side redaction in `ReportsService.render` — and turn it into
 * bytes. They make no policy decisions of their own, and that is the point:
 * a renderer that decided what to include would be a second redaction rule,
 * and two rules that can disagree eventually do.
 *
 * The one thing each renderer must get right is not accidentally reinstating
 * something the rule removed. Evidence with `quotable: false` has no
 * `content` field at all, so a template that writes `item.content` produces
 * nothing rather than the redacted text — but it would also produce a blank
 * where a reader expects prose, so each format says explicitly that the
 * content was withheld. A visible "not quotable" is honest; a silent gap
 * looks like the participant said nothing.
 *
 * PDF is deliberately absent. It needs a rendering engine, a font pipeline
 * and a headless browser or equivalent, none of which the MVP has, and the
 * printable HTML export prints acceptably from a browser.
 */

import type {
  RenderedEvidence,
  RenderedOutcome,
  RenderedReport,
  ReportExportFormat,
} from '@witness/contracts';

const ATTRIBUTION_LABELS: Record<RenderedEvidence['attribution'], string> = {
  named_participant: 'Named participant',
  pseudonymous_participant: 'Participant (pseudonym)',
  anonymous_participant: 'Anonymous participant',
  facilitator_observation: "Facilitator's observation",
  institutional_source: 'Institutional source',
  unattributed: 'Unattributed',
};

const WITHHELD =
  'Content withheld — the participant did not consent to being quoted for this audience.';

export interface ExportResult {
  readonly body: string;
  readonly contentType: string;
  readonly filename: string;
}

/** Escape for HTML text and attribute contexts. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Quote for CSV. A field beginning with `=`, `+`, `-` or `@` is prefixed with
 * a single quote: spreadsheet software treats those as formulas, and a
 * participant quotation starting with a dash would otherwise be executed
 * rather than displayed. This is CSV injection, and an export of
 * participant-authored text is exactly where it arrives.
 */
function csvField(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function attributionLabel(item: {
  attribution: RenderedEvidence['attribution'];
  pseudonym?: string;
}): string {
  const base = ATTRIBUTION_LABELS[item.attribution];
  return item.pseudonym !== undefined ? `${base}: ${item.pseudonym}` : base;
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'report'
  );
}

/** A printable, self-contained HTML document. No external requests. */
export function renderHtml(report: RenderedReport): string {
  const { report: meta, session } = report;

  const evidenceHtml = report.evidence
    .map(
      (item) => `      <li>
        <p class="title">${escapeHtml(item.title)}</p>
        <p class="meta">${escapeHtml(item.evidenceType)} · ${escapeHtml(attributionLabel(item))}</p>
        <p class="${item.quotable ? 'quote' : 'withheld'}">${escapeHtml(item.content ?? WITHHELD)}</p>
      </li>`,
    )
    .join('\n');

  const transcriptHtml = report.transcripts
    .map(
      (item) => `      <li>
        <p class="title">${escapeHtml(item.evidenceTitle)}</p>
        <p class="meta">${escapeHtml(attributionLabel(item))}</p>
        <p class="${item.quotable ? 'quote' : 'withheld'}">${escapeHtml(item.content ?? WITHHELD)}</p>
      </li>`,
    )
    .join('\n');

  const outcomeHtml = (items: RenderedOutcome[]): string =>
    items
      .map(
        (item) => `      <li>
        <p class="title">${escapeHtml(item.title)} <span class="status">${escapeHtml(item.status)}</span></p>
        ${item.owner !== undefined ? `<p class="meta">Owner: ${escapeHtml(item.owner)}${item.dueDate !== undefined ? ` · due ${escapeHtml(item.dueDate.slice(0, 10))}` : ''}</p>` : ''}
        <p>${escapeHtml(item.detail)}</p>
      </li>`,
      )
      .join('\n');

  const narrative = (heading: string, body: string | null): string =>
    body === null
      ? ''
      : `    <section>
      <h2>${escapeHtml(heading)}</h2>
      <p class="synthesis-note">The facilitator's own interpretation, not participant testimony.</p>
      <p>${escapeHtml(body)}</p>
    </section>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(meta.title)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.55; color: #1a1a1a; }
  h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
  h2 { font-size: 1.15rem; margin-top: 2rem; border-bottom: 1px solid #ccc; padding-bottom: 0.2rem; }
  ul { list-style: none; padding: 0; }
  li { margin-bottom: 1.2rem; }
  .title { font-weight: bold; margin: 0; }
  .meta, .synthesis-note { color: #555; font-size: 0.85rem; margin: 0.1rem 0 0.4rem; }
  .status { font-weight: normal; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
  .quote { margin: 0; padding-left: 0.8rem; border-left: 3px solid #bbb; }
  .withheld { margin: 0; padding-left: 0.8rem; border-left: 3px dashed #bbb; color: #666; font-style: italic; }
  .provenance { margin-top: 2.5rem; font-size: 0.8rem; color: #555; border-top: 1px solid #ccc; padding-top: 0.8rem; }
  @media print { body { margin: 0; max-width: none; } }
</style>
</head>
<body>
  <h1>${escapeHtml(meta.title)}</h1>
  <p class="meta">${escapeHtml(report.organisationName)} · ${escapeHtml(report.workspaceName)}</p>
  <p class="meta">${escapeHtml(session.title)} · ${escapeHtml(session.sessionType)}${session.scheduledStart !== null ? ` · ${escapeHtml(session.scheduledStart.slice(0, 10))}` : ''}${session.location !== null ? ` · ${escapeHtml(session.location)}` : ''}</p>
  <p class="meta">Revision ${meta.revision} · ${escapeHtml(meta.status.replace(/_/g, ' '))} · ${escapeHtml(meta.audience)} audience</p>
${meta.purpose !== null ? `  <section><h2>Purpose</h2><p>${escapeHtml(meta.purpose)}</p></section>` : ''}
  <section>
    <h2>Who took part</h2>
    <p>${report.participants.total} participants — ${report.participants.named} named, ${report.participants.pseudonymous} pseudonymous, ${report.participants.anonymous} anonymous. ${report.participants.withdrawn} withdrew.</p>
    <p class="meta">Participants are summarised by count. Individuals are never listed in a report.</p>
  </section>
  <section>
    <h2>Validated evidence</h2>
    <ul>
${evidenceHtml}
    </ul>
  </section>
  <section>
    <h2>Transcripts</h2>
    <ul>
${transcriptHtml}
    </ul>
  </section>
${report.sessionSummary !== null ? `  <section><h2>Session summary</h2><p class="synthesis-note">Local AI-generated, with any human edits applied.</p><p>${escapeHtml(report.sessionSummary.content)}</p></section>` : ''}
  <section><h2>Decisions</h2><ul>
${outcomeHtml(report.decisions)}
  </ul></section>
  <section><h2>Commitments</h2><ul>
${outcomeHtml(report.commitments)}
  </ul></section>
  <section><h2>Actions</h2><ul>
${outcomeHtml(report.actions)}
  </ul></section>
${narrative("Facilitator's synthesis", meta.facilitatorSynthesis)}
${narrative('Unresolved questions', meta.unresolvedQuestions)}
${narrative('Recommendations', meta.recommendations)}
  <p class="provenance">
    Generated ${escapeHtml(report.generatedAt)}. Approved by ${escapeHtml(meta.approvedBy?.displayName ?? 'not yet approved')}${meta.approvedAt !== null ? ` on ${escapeHtml(meta.approvedAt.slice(0, 10))}` : ''}.
    ${meta.sources.length} source records cited.${report.redactedCount > 0 ? ` ${report.redactedCount} record(s) were withheld from this copy under participant consent.` : ''}
  </p>
</body>
</html>`;
}

export function renderMarkdown(report: RenderedReport): string {
  const { report: meta, session } = report;
  const lines: string[] = [];

  lines.push(`# ${meta.title}`, '');
  lines.push(`${report.organisationName} · ${report.workspaceName}`, '');
  lines.push(
    `${session.title} · ${session.sessionType}${session.scheduledStart !== null ? ` · ${session.scheduledStart.slice(0, 10)}` : ''}`,
  );
  lines.push(
    `Revision ${meta.revision} · ${meta.status.replace(/_/g, ' ')} · ${meta.audience} audience`,
    '',
  );

  if (meta.purpose !== null) lines.push('## Purpose', '', meta.purpose, '');

  lines.push('## Who took part', '');
  lines.push(
    `${report.participants.total} participants — ${report.participants.named} named, ${report.participants.pseudonymous} pseudonymous, ${report.participants.anonymous} anonymous. ${report.participants.withdrawn} withdrew.`,
  );
  lines.push('', '_Participants are summarised by count. Individuals are never listed._', '');

  lines.push('## Validated evidence', '');
  for (const item of report.evidence) {
    lines.push(`### ${item.title}`, '');
    lines.push(`_${item.evidenceType} · ${attributionLabel(item)}_`, '');
    lines.push(item.quotable ? `> ${item.content ?? ''}` : `_${WITHHELD}_`, '');
  }

  lines.push('## Transcripts', '');
  for (const item of report.transcripts) {
    lines.push(`### ${item.evidenceTitle}`, '');
    lines.push(`_${attributionLabel(item)}_`, '');
    lines.push(item.quotable ? `> ${item.content ?? ''}` : `_${WITHHELD}_`, '');
  }

  if (report.sessionSummary !== null) {
    lines.push('## Session summary', '');
    lines.push('_Local AI-generated, with any human edits applied._', '');
    lines.push(report.sessionSummary.content, '');
  }

  const outcomeSection = (heading: string, items: RenderedOutcome[]): void => {
    lines.push(`## ${heading}`, '');
    for (const item of items) {
      lines.push(`### ${item.title} (${item.status})`, '');
      if (item.owner !== undefined) {
        lines.push(
          `_Owner: ${item.owner}${item.dueDate !== undefined ? ` · due ${item.dueDate.slice(0, 10)}` : ''}_`,
          '',
        );
      }
      lines.push(item.detail, '');
    }
  };

  outcomeSection('Decisions', report.decisions);
  outcomeSection('Commitments', report.commitments);
  outcomeSection('Actions', report.actions);

  const narrative = (heading: string, body: string | null): void => {
    if (body === null) return;
    lines.push(`## ${heading}`, '');
    lines.push("_The facilitator's own interpretation, not participant testimony._", '');
    lines.push(body, '');
  };

  narrative("Facilitator's synthesis", meta.facilitatorSynthesis);
  narrative('Unresolved questions', meta.unresolvedQuestions);
  narrative('Recommendations', meta.recommendations);

  lines.push('---', '');
  lines.push(
    `Generated ${report.generatedAt}. Approved by ${meta.approvedBy?.displayName ?? 'not yet approved'}${meta.approvedAt !== null ? ` on ${meta.approvedAt.slice(0, 10)}` : ''}. ${meta.sources.length} source records cited.${report.redactedCount > 0 ? ` ${report.redactedCount} record(s) withheld under participant consent.` : ''}`,
  );

  return lines.join('\n');
}

/**
 * A flat CSV of what the report cites, one row per record.
 *
 * CSV is for the reader who wants to sort commitments by due date in a
 * spreadsheet, so it carries the structured records and not the narrative —
 * prose does not survive a cell. Withheld content is stated as such rather
 * than left blank.
 */
export function renderCsv(report: RenderedReport): string {
  const rows: string[] = [
    ['record_type', 'id', 'title', 'status_or_attribution', 'owner', 'due_date', 'content'].join(
      ',',
    ),
  ];

  for (const item of report.evidence) {
    rows.push(
      [
        csvField('evidence'),
        csvField(item.id),
        csvField(item.title),
        csvField(attributionLabel(item)),
        csvField(''),
        csvField(''),
        csvField(item.quotable ? (item.content ?? '') : WITHHELD),
      ].join(','),
    );
  }

  for (const item of report.transcripts) {
    rows.push(
      [
        csvField('transcript'),
        csvField(item.evidenceId),
        csvField(item.evidenceTitle),
        csvField(attributionLabel(item)),
        csvField(''),
        csvField(''),
        csvField(item.quotable ? (item.content ?? '') : WITHHELD),
      ].join(','),
    );
  }

  if (report.sessionSummary !== null) {
    rows.push(
      [
        csvField('session_summary'),
        csvField(''),
        csvField('Session summary'),
        csvField(''),
        csvField(''),
        csvField(''),
        csvField(report.sessionSummary.content),
      ].join(','),
    );
  }

  const outcomeRows = (type: string, items: RenderedOutcome[]): void => {
    for (const item of items) {
      rows.push(
        [
          csvField(type),
          csvField(item.id),
          csvField(item.title),
          csvField(item.status),
          csvField(item.owner ?? ''),
          csvField(item.dueDate?.slice(0, 10) ?? ''),
          csvField(item.detail),
        ].join(','),
      );
    }
  };

  outcomeRows('decision', report.decisions);
  outcomeRows('commitment', report.commitments);
  outcomeRows('action', report.actions);

  return rows.join('\n');
}

/** Render an already-redacted report in the requested format. */
export function renderExport(report: RenderedReport, format: ReportExportFormat): ExportResult {
  const name = `${slug(report.report.title)}-r${report.report.revision}`;

  switch (format) {
    case 'html':
      return {
        body: renderHtml(report),
        contentType: 'text/html; charset=utf-8',
        filename: `${name}.html`,
      };
    case 'markdown':
      return {
        body: renderMarkdown(report),
        contentType: 'text/markdown; charset=utf-8',
        filename: `${name}.md`,
      };
    case 'csv':
      return {
        body: renderCsv(report),
        contentType: 'text/csv; charset=utf-8',
        filename: `${name}.csv`,
      };
    case 'json':
      return {
        body: JSON.stringify(report, null, 2),
        contentType: 'application/json; charset=utf-8',
        filename: `${name}.json`,
      };
  }
}
