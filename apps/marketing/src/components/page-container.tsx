import type { ReactNode } from 'react';

export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={['page-container', className].filter(Boolean).join(' ')}>{children}</div>;
}

export function ContentWidth({ children }: { children: ReactNode }) {
  return <div className="content-width">{children}</div>;
}

export function Section({ children }: { children: ReactNode }) {
  return <section className="section">{children}</section>;
}
