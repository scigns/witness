/**
 * Service-level tests for `EvidenceAttachmentService`, against an in-memory
 * Prisma double — same approach as `evidence.service.test.ts` and
 * `users.service.test.ts`.
 *
 * `ConsentPolicyService` is faked here rather than instantiated for real:
 * `evidence.service.test.ts` already proves the domain and application
 * layers agree on `mayRecordAudio`'s underlying question; these tests only
 * need to prove this service asks it before writing, and respects the
 * answer either way.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InvariantViolation } from '@witness/domain';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../infrastructure/prisma.service.js';
import type { Principal } from '../authz/authorization.port.js';
import { ConsentPolicyService } from '../consent/consent-policy.service.js';
import type { StoragePort } from '../storage/storage.port.js';
import type { StorageQuotaService } from '../organisations/storage-quota.service.js';
import {
  EvidenceAttachmentService,
  type UploadedAttachmentFile,
} from './evidence-attachment.service.js';

const FACILITATOR: Principal = {
  subject: 'dev:facilitator',
  displayName: 'A Facilitator',
  kind: 'human',
  roles: ['contributor'],
};

const WORKSPACE_1 = '11111111-1111-4111-8111-111111111111';
const SESSION_1 = '33333333-3333-4333-8333-333333333333';
const ORGANISATION_1 = '22222222-2222-4222-8222-222222222222';
const EVIDENCE_UNATTRIBUTED = '55555555-5555-4555-8555-555555555555';
const EVIDENCE_ATTRIBUTED = '56666666-6666-4666-8666-666666666666';
const PARTICIPANT_1 = '44444444-4444-4444-8444-444444444444';

function fakeConsent(
  allowed: boolean | { audio?: boolean; evidenceSubmission?: boolean } = true,
): ConsentPolicyService {
  const resolved =
    typeof allowed === 'boolean' ? { audio: allowed, evidenceSubmission: allowed } : allowed;
  return {
    mayRecordAudio: vi.fn().mockResolvedValue({ allowed: resolved.audio ?? true, reason: 'test' }),
    maySubmitEvidence: vi
      .fn()
      .mockResolvedValue({ allowed: resolved.evidenceSubmission ?? true, reason: 'test' }),
  } as unknown as ConsentPolicyService;
}

function fakePrisma() {
  const evidenceRows: Record<string, unknown>[] = [
    {
      id: EVIDENCE_UNATTRIBUTED,
      workspaceId: WORKSPACE_1,
      sessionId: SESSION_1,
      organisationId: ORGANISATION_1,
      sourceParticipantId: null,
    },
    {
      id: EVIDENCE_ATTRIBUTED,
      workspaceId: WORKSPACE_1,
      sessionId: SESSION_1,
      organisationId: ORGANISATION_1,
      sourceParticipantId: PARTICIPANT_1,
    },
  ];
  const attachments: Record<string, unknown>[] = [];
  const actors: Record<string, unknown>[] = [];
  const auditEvents: Record<string, unknown>[] = [];

  const prisma = {
    evidence: {
      findUnique: async ({ where, select }: { where: { id: string }; select?: unknown }) => {
        const row = evidenceRows.find((e) => e['id'] === where.id);
        void select;
        return row === undefined ? null : { ...row };
      },
    },
    evidenceAttachment: {
      findUnique: async ({ where }: { where: { evidenceId: string } }) => {
        const row = attachments.find((a) => a['evidenceId'] === where.evidenceId);
        return row === undefined ? null : { ...row };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        attachments.push({ ...data });
        return { ...data };
      },
    },
    actor: {
      findFirst: async ({ where }: { where: { displayName: string; kind: string } }) => {
        const row = actors.find(
          (a) => a['displayName'] === where.displayName && a['kind'] === where.kind,
        );
        return row === undefined ? null : { ...row };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        actors.push({ ...data });
        return { ...data };
      },
    },
    auditEvent: {
      findFirst: async ({ where }: { where: { subjectType: string; subjectId: string } }) => {
        const matching = auditEvents.filter(
          (e) => e['subjectType'] === where.subjectType && e['subjectId'] === where.subjectId,
        );
        return matching.at(-1) ?? null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditEvents.push({ ...data });
        return { ...data };
      },
    },
    $transaction: async <T>(fn: (tx: typeof prisma) => Promise<T>) => fn(prisma),
  };

  return { prisma: prisma as unknown as PrismaService, attachments, auditEvents };
}

function audioFile(overrides: Partial<UploadedAttachmentFile> = {}): UploadedAttachmentFile {
  return {
    originalname: 'session-recording.mp3',
    mimetype: 'audio/mpeg',
    size: 1024,
    buffer: Buffer.from('fake audio bytes'),
    ...overrides,
  };
}

// Real magic bytes, not just a plausible-looking buffer — evidence-attachment.service.ts now
// verifies document/image content against their declared type, so a fake buffer with the wrong
// signature would be rejected before ever reaching the assertions these helpers exist for.
const PDF_SIGNATURE = Buffer.from('%PDF-1.4\nfake pdf bytes');
const JPEG_SIGNATURE = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff]),
  Buffer.from('fake image bytes'),
]);

function documentFile(overrides: Partial<UploadedAttachmentFile> = {}): UploadedAttachmentFile {
  return {
    originalname: 'exhibit-a.pdf',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: PDF_SIGNATURE,
    ...overrides,
  };
}

function imageFile(overrides: Partial<UploadedAttachmentFile> = {}): UploadedAttachmentFile {
  return {
    originalname: 'poster.jpg',
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: JPEG_SIGNATURE,
    ...overrides,
  };
}

function fakeStorage() {
  const objects = new Map<string, { content: Buffer; contentType: string }>();
  const storage: StoragePort = {
    put: async (key, content, contentType) => {
      objects.set(key, { content, contentType });
    },
    get: async (key) => objects.get(key) ?? null,
    delete: async (key) => {
      objects.delete(key);
    },
  } as unknown as StoragePort;
  return { storage, objects };
}

/** Allows by default — quota-rejection tests pass a fake that throws instead. */
function fakeStorageQuota(checkQuota: StorageQuotaService['checkQuota'] = async () => {}) {
  return { checkQuota } as unknown as StorageQuotaService;
}

function service(
  options: {
    allowed?: boolean | { audio?: boolean; evidenceSubmission?: boolean };
    maxMb?: number;
    storage?: StoragePort | null;
    storageQuota?: StorageQuotaService;
  } = {},
) {
  const { prisma, attachments, auditEvents } = fakePrisma();
  const consent = fakeConsent(options.allowed ?? true);
  const svc = new EvidenceAttachmentService(
    prisma,
    consent,
    { maxEvidenceAttachmentMb: options.maxMb ?? 200 } as never,
    options.storage ?? null,
    options.storageQuota ?? fakeStorageQuota(),
  );
  return { svc, attachments, auditEvents, consent };
}

describe('EvidenceAttachmentService', () => {
  it('stores an attachment for evidence with no source participant, no consent check needed', async () => {
    const { svc, attachments, auditEvents } = service();

    const result = await svc.upload(
      WORKSPACE_1,
      SESSION_1,
      EVIDENCE_UNATTRIBUTED,
      audioFile(),
      FACILITATOR,
    );

    expect(result.contentType).toBe('audio/mpeg');
    expect(result.checksumSha256).toHaveLength(64);
    expect(attachments).toHaveLength(1);
    expect(auditEvents).toMatchObject([{ subjectType: 'evidence_attachment' }]);
  });

  it('checks mayRecordAudio for evidence with a source participant, and refuses when denied', async () => {
    const { svc } = service({ allowed: false });

    await expect(
      svc.upload(WORKSPACE_1, SESSION_1, EVIDENCE_ATTRIBUTED, audioFile(), FACILITATOR),
    ).rejects.toThrow(ForbiddenException);
  });

  it('stores an attachment for evidence with a source participant when consent allows it', async () => {
    const { svc, attachments } = service({ allowed: true });

    await svc.upload(WORKSPACE_1, SESSION_1, EVIDENCE_ATTRIBUTED, audioFile(), FACILITATOR);

    expect(attachments).toHaveLength(1);
  });

  it('refuses a second attachment for the same evidence', async () => {
    const { svc } = service();

    await svc.upload(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED, audioFile(), FACILITATOR);

    await expect(
      svc.upload(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED, audioFile(), FACILITATOR),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a content type that matches no supported kind at all, before any consent check', async () => {
    const { svc, consent } = service();

    await expect(
      svc.upload(
        WORKSPACE_1,
        SESSION_1,
        EVIDENCE_UNATTRIBUTED,
        audioFile({ mimetype: 'video/mp4' }),
        FACILITATOR,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(consent.mayRecordAudio).not.toHaveBeenCalled();
    expect(consent.maySubmitEvidence).not.toHaveBeenCalled();
  });

  it('rejects a file over the configured limit', async () => {
    const { svc } = service({ maxMb: 1 });

    await expect(
      svc.upload(
        WORKSPACE_1,
        SESSION_1,
        EVIDENCE_UNATTRIBUTED,
        audioFile({ size: 2 * 1024 * 1024 }),
        FACILITATOR,
      ),
    ).rejects.toThrow(PayloadTooLargeException);
  });

  it('rejects an upload that would exceed the organisation storage quota, as a clean 413', async () => {
    const storageQuota = fakeStorageQuota(async () => {
      throw new InvariantViolation('would exceed quota', 'STORAGE_QUOTA_EXCEEDED');
    });
    const { svc } = service({ storageQuota });

    await expect(
      svc.upload(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED, audioFile(), FACILITATOR),
    ).rejects.toThrow(PayloadTooLargeException);
  });

  it('does not translate an unrelated InvariantViolation from the quota check into a 413', async () => {
    const storageQuota = fakeStorageQuota(async () => {
      throw new InvariantViolation('something else went wrong', 'SOME_OTHER_CODE');
    });
    const { svc } = service({ storageQuota });

    await expect(
      svc.upload(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED, audioFile(), FACILITATOR),
    ).rejects.toThrow(InvariantViolation);
  });

  it('requires a file', async () => {
    const { svc } = service();

    await expect(
      svc.upload(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED, undefined, FACILITATOR),
    ).rejects.toThrow(BadRequestException);
  });

  it('404s for evidence outside the given workspace/session', async () => {
    const { svc } = service();

    await expect(
      svc.upload('does-not-exist', SESSION_1, EVIDENCE_UNATTRIBUTED, audioFile(), FACILITATOR),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns the stored content for download', async () => {
    const { svc } = service();
    const file = audioFile();
    await svc.upload(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED, file, FACILITATOR);

    const downloaded = await svc.content(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED);

    expect(downloaded.filename).toBe(file.originalname);
    expect(downloaded.contentType).toBe(file.mimetype);
    expect(Buffer.compare(downloaded.content as unknown as Buffer, file.buffer)).toBe(0);
  });

  it('404s downloading when nothing has been attached yet', async () => {
    const { svc } = service();

    await expect(svc.content(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('writes to StoragePort and stores no content column when object storage is enabled', async () => {
    const { storage, objects } = fakeStorage();
    const { svc, attachments } = service({ storage });
    const file = audioFile();

    await svc.upload(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED, file, FACILITATOR);

    expect(attachments[0]?.['content']).toBeNull();
    expect(attachments[0]?.['storageKey']).toEqual(expect.any(String));
    expect(objects.size).toBe(1);

    const downloaded = await svc.content(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED);
    expect(Buffer.compare(downloaded.content as unknown as Buffer, file.buffer)).toBe(0);
  });

  it("scopes the storage key by organisation — objectKey()'s isolation guarantee, exercised end to end", async () => {
    const { storage, objects } = fakeStorage();
    const { svc } = service({ storage });
    const file = audioFile();

    await svc.upload(WORKSPACE_1, SESSION_1, EVIDENCE_UNATTRIBUTED, file, FACILITATOR);

    const [key] = [...objects.keys()];
    expect(key).toMatch(new RegExp(`^${ORGANISATION_1}/evidence-attachment/`));
  });
});

describe('document and image evidence — the evidence_submission consent gate', () => {
  it('accepts a document when evidence_submission is granted, asking that question and not mayRecordAudio', async () => {
    const { svc, attachments, consent } = service({
      allowed: { evidenceSubmission: true },
    });

    const result = await svc.upload(
      WORKSPACE_1,
      SESSION_1,
      EVIDENCE_ATTRIBUTED,
      documentFile(),
      FACILITATOR,
    );

    expect(result.kind).toBe('document');
    expect(attachments).toHaveLength(1);
    expect(consent.maySubmitEvidence).toHaveBeenCalledWith(
      SESSION_1,
      PARTICIPANT_1,
      expect.any(Date),
    );
    expect(consent.mayRecordAudio).not.toHaveBeenCalled();
  });

  it('accepts an image when evidence_submission is granted', async () => {
    const { svc, attachments } = service({ allowed: { evidenceSubmission: true } });

    const result = await svc.upload(
      WORKSPACE_1,
      SESSION_1,
      EVIDENCE_ATTRIBUTED,
      imageFile(),
      FACILITATOR,
    );

    expect(result.kind).toBe('image');
    expect(attachments).toHaveLength(1);
  });

  it('denies a document submission when evidence_submission is missing/refused, even if audio_recording is granted', async () => {
    const { svc, attachments } = service({
      allowed: { audio: true, evidenceSubmission: false },
    });

    await expect(
      svc.upload(WORKSPACE_1, SESSION_1, EVIDENCE_ATTRIBUTED, documentFile(), FACILITATOR),
    ).rejects.toThrow(ForbiddenException);
    expect(attachments).toHaveLength(0);
  });

  it('denies an image submission when evidence_submission is missing/refused', async () => {
    const { svc, attachments } = service({ allowed: { evidenceSubmission: false } });

    await expect(
      svc.upload(WORKSPACE_1, SESSION_1, EVIDENCE_ATTRIBUTED, imageFile(), FACILITATOR),
    ).rejects.toThrow(ForbiddenException);
    expect(attachments).toHaveLength(0);
  });

  it('a denied document submission writes no R2 object and leaves quota unchecked', async () => {
    const { storage, objects } = fakeStorage();
    const checkQuota = vi.fn().mockResolvedValue(undefined);
    const { svc } = service({
      allowed: { evidenceSubmission: false },
      storage,
      storageQuota: fakeStorageQuota(checkQuota),
    });

    await expect(
      svc.upload(WORKSPACE_1, SESSION_1, EVIDENCE_ATTRIBUTED, documentFile(), FACILITATOR),
    ).rejects.toThrow(ForbiddenException);

    expect(objects.size).toBe(0);
    expect(checkQuota).not.toHaveBeenCalled();
  });

  it('a permitted document submission writes exactly one R2 object and checks quota exactly once', async () => {
    const { storage, objects } = fakeStorage();
    const checkQuota = vi.fn().mockResolvedValue(undefined);
    const { svc } = service({
      allowed: { evidenceSubmission: true },
      storage,
      storageQuota: fakeStorageQuota(checkQuota),
    });

    await svc.upload(WORKSPACE_1, SESSION_1, EVIDENCE_ATTRIBUTED, documentFile(), FACILITATOR);

    expect(objects.size).toBe(1);
    expect(checkQuota).toHaveBeenCalledTimes(1);
  });

  it('a second attempt against the same evidence after a denial still gets ATTACHMENT_EXISTS-free 403 (no partial state to conflict with)', async () => {
    const { svc, attachments } = service({ allowed: { evidenceSubmission: false } });

    await expect(
      svc.upload(WORKSPACE_1, SESSION_1, EVIDENCE_ATTRIBUTED, documentFile(), FACILITATOR),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      svc.upload(WORKSPACE_1, SESSION_1, EVIDENCE_ATTRIBUTED, documentFile(), FACILITATOR),
    ).rejects.toThrow(ForbiddenException);

    expect(attachments).toHaveLength(0);
  });

  it('rejects a document claiming application/pdf whose bytes are not actually a PDF, before any consent check', async () => {
    const { svc, consent } = service({ allowed: { evidenceSubmission: true } });

    await expect(
      svc.upload(
        WORKSPACE_1,
        SESSION_1,
        EVIDENCE_ATTRIBUTED,
        documentFile({ buffer: Buffer.from('not actually a pdf') }),
        FACILITATOR,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(consent.maySubmitEvidence).not.toHaveBeenCalled();
  });

  it('rejects an image claiming image/jpeg whose bytes are not actually a JPEG', async () => {
    const { svc } = service({ allowed: { evidenceSubmission: true } });

    await expect(
      svc.upload(
        WORKSPACE_1,
        SESSION_1,
        EVIDENCE_ATTRIBUTED,
        imageFile({ buffer: Buffer.from('not actually a jpeg') }),
        FACILITATOR,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects bytes that are a real JPEG but declared as application/pdf — the signature must match the declared type, not just be a known one', async () => {
    const { svc } = service({ allowed: { evidenceSubmission: true } });

    await expect(
      svc.upload(
        WORKSPACE_1,
        SESSION_1,
        EVIDENCE_ATTRIBUTED,
        documentFile({ buffer: JPEG_SIGNATURE }),
        FACILITATOR,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a real PNG declared as image/png', async () => {
    const pngSignature = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('fake png bytes'),
    ]);
    const { svc, attachments } = service({ allowed: { evidenceSubmission: true } });

    await svc.upload(
      WORKSPACE_1,
      SESSION_1,
      EVIDENCE_ATTRIBUTED,
      imageFile({ mimetype: 'image/png', originalname: 'poster.png', buffer: pngSignature }),
      FACILITATOR,
    );

    expect(attachments).toHaveLength(1);
  });

  it('404s a document upload aimed at an evidence row outside the given workspace/session regardless of consent', async () => {
    const { svc } = service({ allowed: { evidenceSubmission: true } });

    await expect(
      svc.upload('does-not-exist', SESSION_1, EVIDENCE_ATTRIBUTED, documentFile(), FACILITATOR),
    ).rejects.toThrow(NotFoundException);
  });
});
