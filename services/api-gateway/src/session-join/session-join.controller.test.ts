/**
 * Reproduced during the Witness Participate Phase 0 audit
 * (docs/mobile/WITNESS_PARTICIPATE_CURRENT_STATE.md §2): `SessionJoinService
 * .join()` calls `assertSessionJoinLinkUsable`
 * (packages/domain/src/session-join-link.ts), which throws a raw
 * `InvariantViolation` for an expired/revoked/wrong-status join link. This
 * controller had no domain-error translation at all, so that reached a real
 * participant as an unhandled 500 — the same class of bug MOBILE-002 already
 * fixed on the consent path (`participant-capture.controller.ts`'s own
 * `translateDomainErrors`), reproduced independently here on the join path.
 */

import type { Request } from 'express';
import { BadRequestException } from '@nestjs/common';
import { InvariantViolation } from '@witness/domain';
import { describe, expect, it, vi } from 'vitest';

import { SessionJoinController } from './session-join.controller.js';
import type { SessionJoinService } from './session-join.service.js';

function fakeSessionJoin(overrides: Partial<SessionJoinService> = {}) {
  return {
    getContext: vi.fn(),
    join: vi.fn(),
    ...overrides,
  } as unknown as SessionJoinService;
}

function fakeRequest(): Request {
  return { headers: {}, socket: { remoteAddress: '203.0.113.9' } } as never;
}

describe('SessionJoinController.join — domain error translation', () => {
  it('translates an expired/revoked join-link DomainError into a 400, not an unhandled 500', async () => {
    const sessionJoin = fakeSessionJoin({
      join: vi
        .fn()
        .mockRejectedValue(
          new InvariantViolation('This join link has expired.', 'JOIN_LINK_EXPIRED'),
        ),
    });
    const controller = new SessionJoinController(sessionJoin);

    await expect(
      controller.join(
        'token',
        { clientRequestId: '11111111-1111-1111-1111-111111111111' },
        fakeRequest(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      controller.join(
        'token',
        { clientRequestId: '11111111-1111-1111-1111-111111111111' },
        fakeRequest(),
      ),
    ).rejects.toMatchObject({
      response: { error: { code: 'JOIN_LINK_EXPIRED', message: 'This join link has expired.' } },
    });
  });

  it('still returns the join result when the service succeeds', async () => {
    const result = {
      participantId: 'p-1',
      sessionId: 's-1',
      workspaceId: 'w-1',
      identityMode: 'anonymous' as const,
      displayName: 'Anonymous participant',
      captureToken: 'raw-token',
    };
    const sessionJoin = fakeSessionJoin({ join: vi.fn().mockResolvedValue(result) });
    const controller = new SessionJoinController(sessionJoin);

    await expect(
      controller.join(
        'token',
        { clientRequestId: '11111111-1111-1111-1111-111111111111' },
        fakeRequest(),
      ),
    ).resolves.toEqual(result);
  });

  it('does not swallow a non-domain error (e.g. an unexpected infrastructure failure)', async () => {
    const sessionJoin = fakeSessionJoin({
      join: vi.fn().mockRejectedValue(new Error('unexpected')),
    });
    const controller = new SessionJoinController(sessionJoin);

    await expect(
      controller.join(
        'token',
        { clientRequestId: '11111111-1111-1111-1111-111111111111' },
        fakeRequest(),
      ),
    ).rejects.toThrow('unexpected');
  });
});
