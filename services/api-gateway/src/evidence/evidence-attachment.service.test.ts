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
const EVIDENCE_UNATTRIBUTED = '55555555-5555-4555-8555-555555555555';
const EVIDENCE_ATTRIBUTED = '56666666-6666-4666-8666-666666666666';
const PARTICIPANT_1 = '44444444-4444-4444-8444-444444444444';

function fakeConsent(allowed: boolean): ConsentPolicyService {
  return {
    mayRecordAudio: vi.fn().mockResolvedValue({ allowed, reason: 'test' }),
  } as unknown as ConsentPolicyService;
}

function fakePrisma() {
  const evidenceRows: Record<string, unknown>[] = [
    {
      id: EVIDENCE_UNATTRIBUTED,
      workspaceId: WORKSPACE_1,
      sessionId: SESSION_1,
      sourceParticipantId: null,
    },
    {
      id: EVIDENCE_ATTRIBUTED,
      workspaceId: WORKSPACE_1,
      sessionId: SESSION_1,
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

function service(options: { allowed?: boolean; maxMb?: number } = {}) {
  const { prisma, attachments, auditEvents } = fakePrisma();
  const svc = new EvidenceAttachmentService(prisma, fakeConsent(options.allowed ?? true), {
    maxEvidenceAttachmentMb: options.maxMb ?? 200,
  } as never);
  return { svc, attachments, auditEvents };
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

  it('rejects an unsupported content type', async () => {
    const { svc } = service();

    await expect(
      svc.upload(
        WORKSPACE_1,
        SESSION_1,
        EVIDENCE_UNATTRIBUTED,
        audioFile({ mimetype: 'video/mp4' }),
        FACILITATOR,
      ),
    ).rejects.toThrow(InvariantViolation);
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
});
