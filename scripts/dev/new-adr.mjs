#!/usr/bin/env node
/** Create a new ADR from the template with the next sequential number. */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'architecture/decisions';
const TEMPLATE = 'templates/adr/ADR-TEMPLATE.md';

const title = process.argv.slice(2).join(' ').trim();
if (!title) {
  console.error('Usage: make adr TITLE="short imperative title"');
  process.exit(1);
}

const existing = readdirSync(DIR)
  .filter((f) => /^ADR-\d{4}/.test(f))
  .map((f) => Number.parseInt(f.slice(4, 8), 10));
const next = String(Math.max(-1, ...existing) + 1).padStart(4, '0');

const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const file = join(DIR, `ADR-${next}-${slug}.md`);

const body = readFileSync(TEMPLATE, 'utf8')
  .replace('# ADR-NNNN: <short imperative title>', `# ADR-${next}: ${title}`)
  .replace('| **Date** | YYYY-MM-DD |', `| **Date** | ${new Date().toISOString().slice(0, 10)} |`);

writeFileSync(file, body);
console.log(`Created ${file}

Next:
  1. Fill in Context, Options considered, Decision and Consequences.
  2. The Negative section must not be empty — CI checks it.
  3. Add it to ${DIR}/README.md.
  4. Open a PR labelled 'adr' with status Proposed. Minimum 7 days discussion.`);
