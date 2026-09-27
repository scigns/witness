import { describe, expect, it } from 'vitest';

import { isLoopbackAddress } from './loopback.js';

describe('isLoopbackAddress', () => {
  it('accepts the three loopback forms Express can report', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
  });

  it('rejects a private-LAN address — loopback means this machine, not "looks private"', () => {
    expect(isLoopbackAddress('192.168.1.42')).toBe(false);
    expect(isLoopbackAddress('10.0.0.5')).toBe(false);
    expect(isLoopbackAddress('172.20.10.4')).toBe(false);
  });

  it('rejects a public address', () => {
    expect(isLoopbackAddress('8.8.8.8')).toBe(false);
  });

  it('fails closed (rejects) when the address is unknown, rather than assuming local', () => {
    expect(isLoopbackAddress(undefined)).toBe(false);
  });
});
