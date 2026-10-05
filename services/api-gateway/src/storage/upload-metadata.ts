import { BadRequestException } from '@nestjs/common';

export function validateUploadMetadata(filename: string, contentType: string): void {
  if (
    !filename.trim() ||
    filename.length > 300 ||
    [...filename].some(
      (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || c === '/' || c === '\\',
    ) ||
    contentType.length > 100 ||
    !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(contentType)
  ) {
    throw new BadRequestException({
      error: {
        code: 'INVALID_UPLOAD_METADATA',
        message: 'A safe filename and valid media type are required.',
      },
    });
  }
}

export function downloadDisposition(filename: string): string {
  const fallback = [...filename]
    .map((c) =>
      c.charCodeAt(0) < 32 || c.charCodeAt(0) > 126 || c === '"' || c === '\\' ? '_' : c,
    )
    .join('');
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
