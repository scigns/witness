'use client';

/**
 * Sub-navigation within a program's Knowledge section (Phase 3 manual
 * curation — 3A). Graph is deliberately not first and never the default
 * route (`/knowledge` itself renders Overview): a graph view invites
 * treating the projection as the record, and this feature's whole premise
 * is that PostgreSQL, not the graph, is authoritative (ADR-0011).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const REVIEW_ROLES = new Set(['admin', 'reviewer', 'steward']);
const STEWARD_ROLES = new Set(['admin', 'steward']);
const MANAGE_ROLES = new Set(['admin']);

interface KnowledgeNavProps {
  workspaceId: string;
  role: string | null;
}

export function KnowledgeNav({ workspaceId, role }: KnowledgeNavProps) {
  const pathname = usePathname();
  const base = `/workspaces/${workspaceId}/knowledge`;

  const items = [
    { href: base, label: 'Overview', exact: true },
    { href: `${base}/concepts`, label: 'Concepts' },
    { href: `${base}/relationships`, label: 'Relationships' },
    ...(role !== null && REVIEW_ROLES.has(role)
      ? [{ href: `${base}/review`, label: 'Review Queue' }]
      : []),
    ...(role !== null && STEWARD_ROLES.has(role)
      ? [{ href: `${base}/stewardship`, label: 'Stewardship' }]
      : []),
    ...(role !== null && MANAGE_ROLES.has(role)
      ? [{ href: `${base}/domains`, label: 'Domains' }]
      : []),
    { href: `${base}/graph`, label: 'Graph' },
  ];

  return (
    <nav
      aria-label="Knowledge navigation"
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
                'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
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
