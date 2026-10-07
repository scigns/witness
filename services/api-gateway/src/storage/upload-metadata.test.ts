import { describe, expect, it } from 'vitest';
import { downloadDisposition, validateUploadMetadata } from './upload-metadata.js';

describe('upload metadata', () => {
  it.each(['../secret', 'folder/file', 'folder\\file', 'bad\r\nHeader: injected', ''])(
    'rejects unsafe filename %s',
    (name) => {
      expect(() => validateUploadMetadata(name, 'text/plain')).toThrow();
    },
  );
  it('permits Unicode while producing an ASCII-safe encoded download header', () => {
    validateUploadMetadata('Tālofa (1).pdf', 'application/pdf');
    const header = downloadDisposition('Tālofa (1).pdf');
    expect([...header].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126)).toBe(true);
    expect(header).toContain('T%C4%81lofa%20%281%29.pdf');
  });
  it('rejects oversized names and malformed MIME values', () => {
    expect(() => validateUploadMetadata('x'.repeat(301), 'text/plain')).toThrow();
    expect(() => validateUploadMetadata('file', 'text/plain\r\nInjected: yes')).toThrow();
  });
});
