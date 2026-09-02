# Cloudflare Email Routing utility

**Owner:** Infrastructure Lead
**Status:** Operational

This utility inspects and idempotently creates Witness departmental forwarding
rules. It does not create mailboxes, enable catch-all, delete or edit rules, or
change DNS. It uses the current Cloudflare REST API with a scoped API token.

Set the four variables documented in `.env.example`, then run:

```bash
pnpm cloudflare:email:inspect
pnpm cloudflare:email:apply
pnpm test:cloudflare:email
```

Inspect is always read-only. Apply validates the zone/account, status,
destination and existing rules. If the destination is absent it requests the
verification email and stops. Re-run apply only after verification. A rule for
one of the seven addresses with different actions is a conflict and is never
overwritten. Email Routing DNS onboarding is deliberately separate: review
current MX records and enable it in Cloudflare before apply.

Minimum token permissions, scoped to the Witness account and
`buildwithwitness.com` zone where the UI permits:

- Zone / Zone / Read (validate the supplied zone ID)
- Zone / Zone Settings / Read (Email Routing status and DNS requirements)
- Zone / Email Routing Rules / Read; add Write only for apply
- User / Email Routing Addresses / Read; add Edit/Write only to request a destination
- Zone / DNS / Read only during onboarding review; Write is not used by this utility

Do not use a Global API Key. `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_ZONE_ID` are identifiers, while the token and destination belong in
the operator secret environment. Output redacts both the token and destination.
