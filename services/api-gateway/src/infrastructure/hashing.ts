/**
 * SHA-256 adapter for the domain's injected `HashFunction`.
 *
 * The domain must not import node:crypto (ADR-0003), so the concrete algorithm
 * lives here. Changing it is a breaking change to every existing audit chain,
 * which is why it is one small file with one obvious purpose rather than an
 * inline call somewhere convenient.
 */

import { createHash } from 'node:crypto';

import type { HashFunction } from '@witness/domain';

export const sha256: HashFunction = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');
