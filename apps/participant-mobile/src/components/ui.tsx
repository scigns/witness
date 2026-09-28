import type { ReactNode } from 'react';

export function Card({ children }: { children: ReactNode }) {
  return <div className="card">{children}</div>;
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div role="alert" className="error-notice">
      {message}
    </div>
  );
}

export function Loading() {
  return (
    <p role="status" className="center muted">
      Loading…
    </p>
  );
}
