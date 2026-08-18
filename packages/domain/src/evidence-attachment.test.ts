import { describe, expect, it } from 'vitest';

import type { Actor } from './actor.js';
import { InvariantViolation } from './errors.js';
import {
  captureEvidenceAttachment,
  inferAttachmentKind,
  matchesDeclaredContentType,
} from './evidence-attachment.js';
import { toActorId, toEvidenceAttachmentId, toEvidenceId } from './ids.js';

const ACTOR: Actor = {
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'A Facilitator',
};
const EVIDENCE_ID = toEvidenceId('22222222-2222-4222-8222-222222222222');
const ATTACHMENT_ID = toEvidenceAttachmentId('33333333-3333-4333-8333-333333333333');
const NOW = new Date('2026-08-11T00:00:00.000Z');

function baseInput() {
  return {
    id: ATTACHMENT_ID,
    evidenceId: EVIDENCE_ID,
    kind: 'audio' as const,
    originalFilename: 'session-recording.mp3',
    contentType: 'audio/mpeg',
    sizeBytes: 4096,
    checksumSha256: 'a'.repeat(64),
    capturedBy: ACTOR,
    at: NOW,
  };
}

describe('captureEvidenceAttachment', () => {
  it('captures a supported audio file', () => {
    const outcome = captureEvidenceAttachment(baseInput());

    expect(outcome.attachment.kind).toBe('audio');
    expect(outcome.attachment.contentType).toBe('audio/mpeg');
    expect(outcome.event.action).toBe('evidence_attachment.captured');
    expect(outcome.event.metadata['sizeBytes']).toBe('4096');
  });

  it('rejects an unsupported content type', () => {
    expect(() => captureEvidenceAttachment({ ...baseInput(), contentType: 'video/mp4' })).toThrow(
      InvariantViolation,
    );
  });

  it('rejects an empty file', () => {
    expect(() => captureEvidenceAttachment({ ...baseInput(), sizeBytes: 0 })).toThrow(
      InvariantViolation,
    );
  });

  it('rejects a blank filename', () => {
    expect(() => captureEvidenceAttachment({ ...baseInput(), originalFilename: '   ' })).toThrow(
      InvariantViolation,
    );
  });

  it('trims the filename', () => {
    const outcome = captureEvidenceAttachment({
      ...baseInput(),
      originalFilename: '  session-recording.mp3  ',
    });

    expect(outcome.attachment.originalFilename).toBe('session-recording.mp3');
  });

  it('captures a supported document', () => {
    const outcome = captureEvidenceAttachment({
      ...baseInput(),
      kind: 'document',
      originalFilename: 'exhibit-a.pdf',
      contentType: 'application/pdf',
    });

    expect(outcome.attachment.kind).toBe('document');
  });

  it('captures a supported image', () => {
    const outcome = captureEvidenceAttachment({
      ...baseInput(),
      kind: 'image',
      originalFilename: 'poster.jpg',
      contentType: 'image/jpeg',
    });

    expect(outcome.attachment.kind).toBe('image');
  });

  it('rejects a document content type submitted as an image', () => {
    expect(() =>
      captureEvidenceAttachment({ ...baseInput(), kind: 'image', contentType: 'application/pdf' }),
    ).toThrow(InvariantViolation);
  });
});

describe('inferAttachmentKind', () => {
  it('maps an audio content type to audio', () => {
    expect(inferAttachmentKind('audio/mpeg')).toBe('audio');
  });

  it('maps a PDF to document', () => {
    expect(inferAttachmentKind('application/pdf')).toBe('document');
  });

  it('maps a JPEG to image', () => {
    expect(inferAttachmentKind('image/jpeg')).toBe('image');
  });

  it('returns null for an unsupported content type', () => {
    expect(inferAttachmentKind('application/zip')).toBeNull();
  });
});

describe('matchesDeclaredContentType', () => {
  const PDF = Buffer.from('%PDF-1.4\n...');
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);

  it('accepts a real PDF declared as application/pdf', () => {
    expect(matchesDeclaredContentType('application/pdf', PDF)).toBe(true);
  });

  it('accepts a real JPEG declared as image/jpeg', () => {
    expect(matchesDeclaredContentType('image/jpeg', JPEG)).toBe(true);
  });

  it('accepts a real PNG declared as image/png', () => {
    expect(matchesDeclaredContentType('image/png', PNG)).toBe(true);
  });

  it('accepts a real WebP declared as image/webp', () => {
    expect(matchesDeclaredContentType('image/webp', WEBP)).toBe(true);
  });

  it('rejects arbitrary bytes declared as application/pdf', () => {
    expect(matchesDeclaredContentType('application/pdf', Buffer.from('not a pdf'))).toBe(false);
  });

  it('rejects a real JPEG declared as application/pdf — the signature must match the declared type', () => {
    expect(matchesDeclaredContentType('application/pdf', JPEG)).toBe(false);
  });

  it('rejects a truncated buffer shorter than the signature it claims', () => {
    expect(matchesDeclaredContentType('image/png', Buffer.from([0x89, 0x50]))).toBe(false);
  });

  it('is not checked for content types with no registered signature (audio) — returns true', () => {
    expect(matchesDeclaredContentType('audio/mpeg', Buffer.from('anything at all'))).toBe(true);
  });
});
