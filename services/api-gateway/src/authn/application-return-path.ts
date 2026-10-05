import { BadRequestException } from '@nestjs/common';

/** A path within the configured application, never an arbitrary redirect URL. */
export function validateApplicationReturnPath(input?: string | null): string {
  if (input === undefined || input === null || input === '' || input === '/') return '/workspaces';
  if (
    typeof input !== 'string' ||
    input.length > 2048 ||
    !input.startsWith('/') ||
    input.startsWith('//') ||
    input.includes('\\') ||
    [...input].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  ) {
    throw new BadRequestException({
      error: {
        code: 'INVALID_RETURN_PATH',
        message: 'A valid application-relative return path is required.',
      },
    });
  }
  const parsed = new URL(input, 'https://witness.invalid');
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(parsed.pathname);
  } catch {
    throw new BadRequestException('Return path encoding is invalid.');
  }
  if (
    parsed.origin !== 'https://witness.invalid' ||
    decodedPath === '/signin' ||
    decodedPath === '/signin/' ||
    decodedPath === '/auth' ||
    decodedPath.startsWith('/auth/')
  )
    throw new BadRequestException({
      error: { code: 'INVALID_RETURN_PATH', message: 'This return path is unavailable.' },
    });
  return parsed.pathname + parsed.search + parsed.hash;
}

export function applicationReturnUrl(baseUrl: string, input?: string | null): string {
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  const path = validateApplicationReturnPath(input);
  const target = new URL(path.slice(1), base);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname))
    throw new BadRequestException('Return path must remain within the application.');
  return target.toString();
}
