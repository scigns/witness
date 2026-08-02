import Link from 'next/link';

/**
 * Explicit 404. Without one, Next.js falls back to a pages-router error document
 * that cannot be prerendered inside an app-router build.
 */
export default function NotFound() {
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <p className="text-[var(--color-ink-muted)]">
        There is nothing at this address. If you followed a link from inside Witness, that is a
        defect worth reporting — a broken internal link in a memory system is exactly the kind of
        thing that erodes trust in it.
      </p>
      <Link href="/" className="inline-block underline">
        ← Back to the dashboard
      </Link>
    </div>
  );
}
