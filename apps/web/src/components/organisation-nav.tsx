'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface OrganisationNavProps {
  organisationId: string;
}

export function OrganisationNav({ organisationId }: OrganisationNavProps) {
  const pathname = usePathname();
  const base = `/organisations/${organisationId}`;

  const items = [
    { href: base, label: 'Overview', exact: true },
    { href: `${base}/programmes`, label: 'Programmes' },
    { href: `${base}/people`, label: 'People' },
    { href: `${base}/invitations`, label: 'Invitations' },
    { href: `${base}/billing`, label: 'Billing' },
  ];

  return (
    <nav
      aria-label="Organisation navigation"
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
