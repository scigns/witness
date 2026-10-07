/** Browser navigation is restricted to application-relative routes. The API validates again. */
export function safeReturnPath(input: string | null | undefined): string {
  if (
    !input ||
    input === '/' ||
    input.length > 2048 ||
    !input.startsWith('/') ||
    input.startsWith('//') ||
    input.includes('\\') ||
    [...input].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    return '/workspaces';
  try {
    const target = new URL(input, 'https://witness.invalid');
    const path = decodeURIComponent(target.pathname);
    if (
      target.origin !== 'https://witness.invalid' ||
      path === '/signin' ||
      path === '/signin/' ||
      path === '/auth' ||
      path.startsWith('/auth/')
    )
      return '/workspaces';
    return target.pathname + target.search + target.hash;
  } catch {
    return '/workspaces';
  }
}
