import { describe, expect, it, vi } from 'vitest';

import { AgreementsService } from './agreements.service.js';

const ids = {
  organisation: '00000000-0000-4000-8000-000000000001',
  otherOrganisation: '00000000-0000-4000-8000-000000000002',
  account: '00000000-0000-4000-8000-000000000003',
  agreement: '00000000-0000-4000-8000-000000000004',
  actor: '00000000-0000-4000-8000-000000000005',
};

const createdAt = new Date('2026-01-01T00:00:00.000Z');
const termStart = '2026-01-01T00:00:00.000Z';
const termEnd = '2027-01-01T00:00:00.000Z';

const principal = {
  subject: 'user:operator',
  displayName: 'Operator',
  kind: 'human',
  roles: [],
} as never;

function fixture(overrides: { existingActive?: unknown } = {}) {
  const account = { id: ids.account, organisationId: ids.organisation };
  const agreementRow = {
    id: ids.agreement,
    organisationId: ids.organisation,
    billingAccountId: ids.account,
    reference: 'MSA-2026-014',
    status: 'ACTIVE',
    termStart: new Date(termStart),
    termEnd: new Date(termEnd),
    notes: null,
    previousAgreementId: null,
    statusChangedAt: createdAt,
    statusReason: null,
    createdAt,
  };

  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    actor: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: ids.actor, kind: 'human', displayName: 'Operator' }),
      create: vi.fn(),
    },
    billingAccount: {
      findFirst: vi
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(where.organisationId === ids.organisation ? account : null),
        ),
    },
    agreement: {
      findFirst: vi.fn().mockImplementation(({ where }) => {
        if (where.status === 'ACTIVE') return Promise.resolve(overrides.existingActive ?? null);
        if (where.id === ids.agreement && where.organisationId === ids.organisation) {
          return Promise.resolve(agreementRow);
        }
        return Promise.resolve(null);
      }),
      create: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn().mockResolvedValue(agreementRow),
    },
    auditEvent: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
  };

  const prisma = { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx)) };
  const service = new AgreementsService(prisma as never);

  return { service, prisma, tx, account, agreementRow };
}

describe('AgreementsService.create', () => {
  it('creates an active agreement and audits it', async () => {
    const f = fixture();
    const result = await f.service.create(
      ids.organisation,
      { reference: 'MSA-2026-014', termStart, termEnd },
      principal,
    );

    expect(result.status).toBe('ACTIVE');
    expect(result.effectiveStatus).toBe('ACTIVE');
    expect(f.tx.agreement.create).toHaveBeenCalledTimes(1);
    expect(f.tx.agreement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reference: 'MSA-2026-014',
          status: 'ACTIVE',
          previousAgreementId: null,
        }),
      }),
    );
    expect(f.tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a second active agreement for the same organisation', async () => {
    const f = fixture({ existingActive: { id: 'other-agreement' } });
    await expect(
      f.service.create(ids.organisation, { reference: 'MSA-2026-015', termStart }, principal),
    ).rejects.toMatchObject({ response: { error: { code: 'AGREEMENT_ALREADY_ACTIVE' } } });
    expect(f.tx.agreement.create).not.toHaveBeenCalled();
  });

  it('rejects a missing billing account', async () => {
    const f = fixture();
    await expect(
      f.service.create(ids.otherOrganisation, { reference: 'MSA-2026-014', termStart }, principal),
    ).rejects.toMatchObject({ response: { error: { code: 'BILLING_ACCOUNT_NOT_FOUND' } } });
  });

  it('rejects an invalid term via the domain layer', async () => {
    const f = fixture();
    await expect(
      f.service.create(
        ids.organisation,
        { reference: 'MSA-2026-014', termStart, termEnd: '2025-01-01T00:00:00.000Z' },
        principal,
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'INVALID_AGREEMENT_TERM' } } });
    expect(f.tx.agreement.create).not.toHaveBeenCalled();
  });
});

describe('AgreementsService.renew', () => {
  it('supersedes the previous agreement and creates the renewal', async () => {
    const f = fixture();
    const result = await f.service.renew(
      ids.organisation,
      ids.agreement,
      { reference: 'MSA-2027-014', termStart: termEnd, termEnd: '2028-01-01T00:00:00.000Z' },
      principal,
    );

    expect(result).toBeDefined();
    expect(f.tx.agreement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ids.agreement },
        data: expect.objectContaining({ status: 'SUPERSEDED' }),
      }),
    );
    expect(f.tx.agreement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reference: 'MSA-2027-014',
          previousAgreementId: ids.agreement,
        }),
      }),
    );
    expect(f.tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('ATTACK — cannot renew an agreement through another organisation', async () => {
    const f = fixture();
    await expect(
      f.service.renew(
        ids.otherOrganisation,
        ids.agreement,
        { reference: 'MSA-2027-014', termStart: termEnd },
        principal,
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'AGREEMENT_NOT_FOUND' } } });
    expect(f.tx.agreement.create).not.toHaveBeenCalled();
  });

  it('rejects a renewal that starts before the previous term', async () => {
    const f = fixture();
    await expect(
      f.service.renew(
        ids.organisation,
        ids.agreement,
        { reference: 'MSA-2027-014', termStart: '2025-01-01T00:00:00.000Z' },
        principal,
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'RENEWAL_PRECEDES_PREVIOUS_TERM' } } });
    expect(f.tx.agreement.update).not.toHaveBeenCalled();
  });
});

describe('AgreementsService.terminate', () => {
  it('terminates an active agreement with a reason and audits it', async () => {
    const f = fixture();
    const result = await f.service.terminate(
      ids.organisation,
      ids.agreement,
      'Organisation exited.',
      principal,
    );

    expect(result).toBeDefined();
    expect(f.tx.agreement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'TERMINATED',
          statusReason: 'Organisation exited.',
        }),
      }),
    );
    expect(f.tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('ATTACK — cannot terminate an agreement through another organisation', async () => {
    const f = fixture();
    await expect(
      f.service.terminate(ids.otherOrganisation, ids.agreement, 'Exit.', principal),
    ).rejects.toMatchObject({ response: { error: { code: 'AGREEMENT_NOT_FOUND' } } });
    expect(f.tx.agreement.update).not.toHaveBeenCalled();
  });
});
