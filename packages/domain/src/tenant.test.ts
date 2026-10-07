import { describe, expect, it } from 'vitest';

import { effectiveTenantId } from './tenant.js';

describe('effectiveTenantId', () => {
  it("falls back to the organisation's own id when no explicit tenant is assigned (today's universal case)", () => {
    expect(effectiveTenantId({ id: 'org-1', tenantId: null })).toBe('org-1');
  });

  it('uses the explicitly assigned tenant when one exists', () => {
    expect(effectiveTenantId({ id: 'org-1', tenantId: 'tenant-shared-7' })).toBe('tenant-shared-7');
  });

  it('two organisations with no explicit tenant assignment never resolve to the same effective tenant', () => {
    const a = effectiveTenantId({ id: 'org-a', tenantId: null });
    const b = effectiveTenantId({ id: 'org-b', tenantId: null });
    expect(a).not.toBe(b);
  });

  it('two organisations explicitly assigned the same tenant do resolve to the same effective tenant (the N:1 seam)', () => {
    const a = effectiveTenantId({ id: 'org-a', tenantId: 'tenant-shared-7' });
    const b = effectiveTenantId({ id: 'org-b', tenantId: 'tenant-shared-7' });
    expect(a).toBe(b);
  });
});
