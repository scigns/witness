import { Card } from '@/components/ui';
import { authApi } from '@/lib/api';

/**
 * Deliberately informational: the invitation email is not a credential. The
 * identity provider verifies the person, and Witness activates only the
 * existing invitation whose email exactly matches that verified identity.
 */
export default function ActivatePage() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Activate your Witness account</h1>
      <Card className="space-y-4">
        <p className="text-sm text-[var(--color-ink-muted)]">
          You have been invited to Witness by your organisation. Continue with the identity provider
          using exactly the email address your organisation invited.
        </p>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Witness securely matches your verified identity email to the existing invitation. Your
          organisation access and role come from that invitation; this page does not create public
          accounts.
        </p>
        <a
          href={authApi.loginUrl()}
          className="inline-flex items-center justify-center rounded bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)] hover:opacity-90"
        >
          Continue to secure sign in
        </a>
        <p className="text-xs text-[var(--color-ink-muted)]">
          Need help? Contact support@buildwithwitness.com
        </p>
      </Card>
    </div>
  );
}
