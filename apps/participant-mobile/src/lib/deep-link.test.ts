import { describe, expect, it } from 'vitest';

import { parseJoinDeepLink } from './deep-link.js';

describe('parseJoinDeepLink', () => {
  it('accepts a valid join link on the live pilot host', () => {
    expect(
      parseJoinDeepLink('https://witness-prod-web.pacificdigitalconsultancy.org/join/abc123'),
    ).toEqual({ token: 'abc123' });
  });

  it('accepts a valid join link on the planned production host', () => {
    expect(parseJoinDeepLink('https://app.buildwithwitness.com/join/abc123')).toEqual({
      token: 'abc123',
    });
  });

  it('rejects an unrecognised host, even one that looks plausible', () => {
    expect(
      parseJoinDeepLink('https://app.buildwithwitness.com.evil.example/join/abc123'),
    ).toBeNull();
    expect(parseJoinDeepLink('https://buildwithwitness.com/join/abc123')).toBeNull();
    expect(parseJoinDeepLink('https://attacker.example/join/abc123')).toBeNull();
  });

  it('rejects a plausible host over plain HTTP — deep links are HTTPS-only', () => {
    expect(
      parseJoinDeepLink('http://witness-prod-web.pacificdigitalconsultancy.org/join/abc123'),
    ).toBeNull();
  });

  it('rejects the wrong path, even on an allowed host', () => {
    expect(parseJoinDeepLink('https://app.buildwithwitness.com/capture/abc123')).toBeNull();
    expect(parseJoinDeepLink('https://app.buildwithwitness.com/join')).toBeNull();
    expect(parseJoinDeepLink('https://app.buildwithwitness.com/')).toBeNull();
  });

  it('rejects a missing or empty token', () => {
    expect(parseJoinDeepLink('https://app.buildwithwitness.com/join/')).toBeNull();
  });

  it('ignores extra query parameters and fragments rather than rejecting them', () => {
    expect(
      parseJoinDeepLink('https://app.buildwithwitness.com/join/abc123?utm_source=qr#top'),
    ).toEqual({ token: 'abc123' });
  });

  it('rejects a malformed URL outright', () => {
    expect(parseJoinDeepLink('not a url at all')).toBeNull();
    expect(parseJoinDeepLink('')).toBeNull();
  });

  it('rejects a non-HTTP(S) scheme, e.g. a crafted custom-scheme link', () => {
    expect(parseJoinDeepLink('witness://join/abc123')).toBeNull();
    expect(parseJoinDeepLink('javascript:alert(1)')).toBeNull();
  });

  it('decodes a percent-encoded token', () => {
    expect(parseJoinDeepLink('https://app.buildwithwitness.com/join/abc%2Bdef')).toEqual({
      token: 'abc+def',
    });
  });

  it('rejects a token with malformed percent-encoding rather than throwing', () => {
    expect(() => parseJoinDeepLink('https://app.buildwithwitness.com/join/abc%')).not.toThrow();
    expect(parseJoinDeepLink('https://app.buildwithwitness.com/join/abc%')).toBeNull();
  });

  it('rejects an attempt to smuggle a second path segment past the token', () => {
    expect(parseJoinDeepLink('https://app.buildwithwitness.com/join/abc123/extra')).toBeNull();
  });
});
