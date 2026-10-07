import { describe, expect, it } from 'vitest';
import { applicationReturnUrl, validateApplicationReturnPath } from './application-return-path.js';

describe('application return paths', () => {
  it.each([undefined, null, '', '/'])('defaults %s to working landing', (input) => {
    expect(validateApplicationReturnPath(input)).toBe('/workspaces');
  });
  it('preserves an application deep link including query and fragment', () => {
    expect(
      applicationReturnUrl('https://app.example/witness/', '/workspaces/123?tab=evidence#file'),
    ).toBe('https://app.example/witness/workspaces/123?tab=evidence#file');
  });
  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/signin',
    '/signin/',
    '/auth/callback',
    '/%73ignin',
    '/bad\r\nHeader',
    '/' + 'x'.repeat(2048),
    '/%zz',
  ])('rejects unsafe or looping target %s', (input) => {
    expect(() => validateApplicationReturnPath(input)).toThrow();
  });
  it('normalises traversal without escaping an application base path', () => {
    expect(applicationReturnUrl('https://app.example/witness/', '/../../records')).toBe(
      'https://app.example/witness/records',
    );
  });
});
