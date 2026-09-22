# Notification Worker

**Owner:** Backend Lead
**Status:** Reserved — Phase 6 as a standalone worker. Not built, not deployed. This directory
contains only this planning document. The notifications Witness sends today (organisation
invitations, workspace invitations) are sent directly and synchronously from
`services/api-gateway/src/infrastructure/mailer.ts` via SMTP — not through a queued worker, and
not yet covering commitment deadlines or review-queue digests, which this document plans and
which do not exist yet in any form.

Commitment deadlines, review queue digests, consent and administrative notices.

Invariant: **a notification never leaks content the recipient is not permitted to see.** Easy to get
wrong, because a digest naturally wants to quote the thing it is notifying about.
