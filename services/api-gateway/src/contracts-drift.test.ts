/**
 * Licence-boundary drift check.
 *
 * `@witness/contracts` is Apache-2.0 and `@witness/domain` is GPL-3.0-or-later.
 * Apache-2.0 code may be consumed by GPL code, never the reverse (ADR-0002), so
 * `contracts` cannot import the domain's unions — it declares its own copies.
 *
 * Two declarations of the same thing drift. This test is the only reason they
 * will not: it lives in the API service, which already depends on both, and so is
 * the one place the comparison can legally be made.
 *
 * If this fails, do not "fix" it by loosening the assertion. Update whichever
 * side is wrong, and check whether an API consumer needs a contract version bump.
 */

import { describe, expect, it } from 'vitest';

import {
  ACTOR_KINDS as CONTRACT_ACTOR_KINDS,
  REVIEW_STATES as CONTRACT_REVIEW_STATES,
  SOURCE_KINDS as CONTRACT_SOURCE_KINDS,
} from '@witness/contracts';
import {
  ACTOR_KINDS as DOMAIN_ACTOR_KINDS,
  REVIEW_STATES as DOMAIN_REVIEW_STATES,
  SOURCE_KINDS as DOMAIN_SOURCE_KINDS,
} from '@witness/domain';

describe('contracts and domain agree across the licence boundary', () => {
  it('review states are identical', () => {
    expect([...CONTRACT_REVIEW_STATES].sort()).toEqual([...DOMAIN_REVIEW_STATES].sort());
  });

  it('source kinds are identical', () => {
    expect([...CONTRACT_SOURCE_KINDS].sort()).toEqual([...DOMAIN_SOURCE_KINDS].sort());
  });

  it('actor kinds are identical', () => {
    expect([...CONTRACT_ACTOR_KINDS].sort()).toEqual([...DOMAIN_ACTOR_KINDS].sort());
  });
});
