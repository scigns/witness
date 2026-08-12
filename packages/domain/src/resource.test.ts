import { describe, expect, it } from 'vitest';

import type { Actor } from './actor.js';
import { InvariantViolation } from './errors.js';
import { toActorId, toResourceId, toUserId, toWorkspaceId } from './ids.js';
import { createResource, removeResource } from './resource.js';

const ACTOR: Actor = {
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'A Facilitator',
};
const WORKSPACE_ID = toWorkspaceId('22222222-2222-4222-8222-222222222222');
const RESOURCE_ID = toResourceId('33333333-3333-4333-8333-333333333333');
const UPLOADER_ID = toUserId('44444444-4444-4444-8444-444444444444');
const NOW = new Date('2026-08-12T00:00:00.000Z');

function baseInput() {
  return {
    id: RESOURCE_ID,
    workspaceId: WORKSPACE_ID,
    title: 'Session slides',
    uploadedById: UPLOADER_ID,
    uploadedBy: ACTOR,
    createdAt: NOW,
  };
}

describe('createResource', () => {
  it('creates a link resource', () => {
    const outcome = createResource({
      ...baseInput(),
      content: { resourceType: 'link', externalUrl: 'https://example.org/deck' },
    });

    expect(outcome.resource.resourceType).toBe('link');
    expect(outcome.resource.externalUrl).toBe('https://example.org/deck');
    expect(outcome.resource.originalFilename).toBeNull();
    expect(outcome.event.action).toBe('resource.uploaded');
  });

  it('creates a file resource', () => {
    const outcome = createResource({
      ...baseInput(),
      content: {
        resourceType: 'file',
        originalFilename: 'slides.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
        content: Buffer.from('pdf-bytes'),
      },
    });

    expect(outcome.resource.resourceType).toBe('file');
    expect(outcome.resource.originalFilename).toBe('slides.pdf');
    expect(outcome.resource.externalUrl).toBeNull();
  });

  it('rejects a blank title', () => {
    expect(() =>
      createResource({
        ...baseInput(),
        title: '   ',
        content: { resourceType: 'link', externalUrl: 'https://example.org' },
      }),
    ).toThrow(InvariantViolation);
  });

  it('rejects a non-http(s) URL', () => {
    expect(() =>
      createResource({
        ...baseInput(),
        content: { resourceType: 'link', externalUrl: 'javascript:alert(1)' },
      }),
    ).toThrow(InvariantViolation);
  });

  it('rejects an invalid URL', () => {
    expect(() =>
      createResource({
        ...baseInput(),
        content: { resourceType: 'link', externalUrl: 'not a url' },
      }),
    ).toThrow(InvariantViolation);
  });

  it('rejects a file over the size limit', () => {
    expect(() =>
      createResource({
        ...baseInput(),
        content: {
          resourceType: 'file',
          originalFilename: 'huge.pdf',
          contentType: 'application/pdf',
          sizeBytes: 51 * 1024 * 1024,
          content: Buffer.alloc(0),
        },
      }),
    ).toThrow(InvariantViolation);
  });
});

describe('removeResource', () => {
  it('produces a resource.removed event', () => {
    const created = createResource({
      ...baseInput(),
      content: { resourceType: 'link', externalUrl: 'https://example.org' },
    }).resource;

    const event = removeResource(created, ACTOR);

    expect(event.action).toBe('resource.removed');
    expect(event.metadata['title']).toBe('Session slides');
  });
});
