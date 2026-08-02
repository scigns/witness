# Notification Worker

**Owner:** Backend Lead
**Status:** Phase 6

Commitment deadlines, review queue digests, consent and administrative notices.

Invariant: **a notification never leaks content the recipient is not permitted to see.** Easy to get
wrong, because a digest naturally wants to quote the thing it is notifying about.
