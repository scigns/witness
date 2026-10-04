/**
 * Help & Knowledge documentation indexer (ADR-0032).
 *
 * "Application Release → Documentation Snapshot → Search Index Version":
 * run this once per deployed release, after migrations, as part of the
 * release process — it is the step that activates the documentation a
 * signed-in user will actually be served for `WITNESS_VERSION`. It is safe
 * to re-run (idempotent per app/doc/index version) and must never run
 * against an environment it cannot reach; it does nothing destructive to
 * any other table.
 *
 * Chunking is deliberately simple for this corpus size: split each
 * indexed markdown file on `##`/`###` headings. A heading becomes a
 * chunk's title and anchor; the text until the next heading of equal or
 * higher level becomes its body. This is not a markdown renderer — it is
 * good enough for "how do I", "what does this mean" style lookup against a
 * few hundred sections, and it is explicitly scoped to stay that simple
 * (ADR-0032 chose Postgres FTS over a dedicated engine for exactly this
 * corpus size; a smarter chunker is a independent, later improvement, not
 * a prerequisite).
 */

import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');

/**
 * Source documents to index, each with the minimum role tier required to
 * see any chunk from it. `docs/guides` and `docs/product` describe
 * capabilities every signed-in user may already reach, so they stay at the
 * `reader` floor; `docs/operations/ADMIN_GUIDE.md` documents admin-only
 * capability and is withheld from everyone else — the same "never reveal
 * documentation for capabilities the user isn't authorised to access" rule
 * the brief states, demonstrated end-to-end rather than only in the ADR.
 */
const SOURCES: ReadonlyArray<{ path: string; minRoleTier: string }> = [
  { path: 'docs/guides/USER_GUIDE.md', minRoleTier: 'reader' },
  { path: 'docs/guides/API_GUIDE.md', minRoleTier: 'reader' },
  { path: 'docs/product/PERSONAS.md', minRoleTier: 'reader' },
  { path: 'docs/operations/ADMIN_GUIDE.md', minRoleTier: 'admin' },
];

interface Chunk {
  title: string;
  anchor: string;
  body: string;
}

function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Splits on any `##`/`###` heading; the `#` title becomes the first chunk's title. */
function chunkMarkdown(markdown: string, fallbackTitle: string): Chunk[] {
  const lines = markdown.split('\n');
  const chunks: Chunk[] = [];
  let currentTitle = fallbackTitle;
  let currentAnchor = '';
  let currentBody: string[] = [];

  const flush = (): void => {
    const body = currentBody.join('\n').trim();
    if (body !== '') chunks.push({ title: currentTitle, anchor: currentAnchor, body });
    currentBody = [];
  };

  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading && heading[1].length >= 2) {
      flush();
      currentTitle = heading[2].trim();
      currentAnchor = slugify(currentTitle);
      continue;
    }
    if (heading && heading[1].length === 1) {
      // Document-level `#` title: keep as context, not a chunk boundary.
      currentTitle = heading[2].trim();
      continue;
    }
    currentBody.push(line);
  }
  flush();

  return chunks;
}

async function readAppVersionFromPackageJson(): Promise<string> {
  const raw = await readFile(join(REPO_ROOT, 'package.json'), 'utf8');
  const pkg = JSON.parse(raw) as { version?: string };
  return process.env['WITNESS_VERSION'] ?? pkg.version ?? '0.1.0';
}

async function main(): Promise<void> {
  const appVersion = await readAppVersionFromPackageJson();
  const docVersion = new Date().toISOString().slice(0, 10);

  const existing = await prisma.documentationSnapshot.findFirst({
    where: { appVersion, docVersion },
    orderBy: { indexVersion: 'desc' },
  });
  const indexVersion = existing === null ? 1 : existing.indexVersion + 1;

  const snapshot = await prisma.documentationSnapshot.create({
    data: { id: randomUUID(), appVersion, docVersion, indexVersion, status: 'ACTIVE' },
  });

  let chunkCount = 0;
  for (const source of SOURCES) {
    const fullPath = join(REPO_ROOT, source.path);
    const fileStat = await stat(fullPath).catch(() => null);
    if (fileStat === null) {
      console.warn(`Skipping missing documentation source: ${source.path}`);
      continue;
    }
    const markdown = await readFile(fullPath, 'utf8');
    const fallbackTitle = source.path.split('/').pop() ?? source.path;
    const chunks = chunkMarkdown(markdown, fallbackTitle);

    for (const chunk of chunks) {
      await prisma.documentationChunk.create({
        data: {
          id: randomUUID(),
          snapshotId: snapshot.id,
          sourcePath: source.path,
          sourceAnchor: chunk.anchor === '' ? null : chunk.anchor,
          title: chunk.title,
          body: chunk.body,
          minRoleTier: source.minRoleTier,
          lastUpdatedAt: fileStat.mtime,
        },
      });
      chunkCount += 1;
    }
  }

  // Exactly one ACTIVE snapshot per appVersion: superseding the prior one
  // keeps a user mid-session on a consistent view, never a half-updated one.
  await prisma.documentationSnapshot.updateMany({
    where: { appVersion, status: 'ACTIVE', id: { not: snapshot.id } },
    data: { status: 'SUPERSEDED' },
  });

  console.warn(
    `Indexed ${chunkCount} documentation chunks into snapshot ${snapshot.id} ` +
      `(appVersion=${appVersion}, docVersion=${docVersion}, indexVersion=${indexVersion}).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
