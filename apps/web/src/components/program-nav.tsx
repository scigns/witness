'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const REVIEW_ROLES = new Set(['admin', 'reviewer']);
const MANAGE_ROLES = new Set(['admin', 'facilitator']);

interface ProgramNavProps {
  workspaceId: string;
  role: string | null;
}

export function ProgramNav({ workspaceId, role }: ProgramNavProps) {
  const pathname = usePathname();
  const base = `/workspaces/${workspaceId}`;

  const items = [
    { href: base, label: 'Overview', exact: true },
    { href: `${base}/sessions`, label: 'Sessions' },
    { href: `${base}/agenda`, label: 'Agenda' },
    { href: `${base}/resources`, label: 'Resources' },
    ...(role !== null && REVIEW_ROLES.has(role)
      ? [{ href: `${base}/review`, label: 'Review' }]
      : []),
    { href: `${base}/search`, label: 'Search' },
    ...(role !== null && MANAGE_ROLES.has(role)
      ? [{ href: `${base}/manage`, label: 'Manage' }]
      : []),
  ];

  return (
    <nav
      aria-label="Program navigation"
      className="-mx-1 overflow-x-auto border-b border-[var(--color-line)]"
    >
      <div className="flex min-w-max gap-1 px-1">
        {items.map((item) => {
          const active =
            item.exact === true
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={[
                'border-b-2 px-3 py-3 text-sm font-medium transition-colors',
                active
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-transparent text-[var(--color-ink-muted)] hover:border-[var(--color-line)] hover:text-[var(--color-ink)]',
              ].join(' ')}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
