import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

import { PageContainer } from './page-container';

type ActionVariant = 'primary' | 'secondary' | 'tertiary';

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ActionVariant }) {
  return (
    <button type={type} className={classes('action', `action-${variant}`, className)} {...props} />
  );
}

export function LinkButton({
  variant = 'primary',
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ActionVariant }) {
  return <a className={classes('action', `action-${variant}`, className)} {...props} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('card', className)} {...props} />;
}

export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={classes('eyebrow', className)} {...props} />;
}

export function SectionHeading({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={classes('section-heading', className)}>
      {eyebrow === undefined ? null : <Eyebrow>{eyebrow}</Eyebrow>}
      <h2>{title}</h2>
      {children === undefined ? null : <div className="section-heading-copy">{children}</div>}
    </header>
  );
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <PageContainer {...(className === undefined ? {} : { className })}>{children}</PageContainer>
  );
}

export function Section({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={classes('section', className)} {...props}>
      {children}
    </section>
  );
}

export function Callout({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <aside className={classes('callout', className)} {...props} />;
}

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={classes('badge', className)} {...props} />;
}

export function FeatureCard({
  title,
  children,
  eyebrow,
}: {
  title: string;
  children: ReactNode;
  eyebrow?: string;
}) {
  return (
    <article className="card feature-card">
      {eyebrow === undefined ? null : <Eyebrow>{eyebrow}</Eyebrow>}
      <h3>{title}</h3>
      <div className="feature-card-copy">{children}</div>
    </article>
  );
}

export function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function CTAGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('cta-group', className)} {...props} />;
}
