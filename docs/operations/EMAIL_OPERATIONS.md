# Witness Email Operations

**Owner:** Infrastructure Lead
**Status:** Operational; production routing verified 2026-09-01

## Domain

`buildwithwitness.com`

## Official departmental addresses

| Address | Owner/function | Permitted use | Future system integration |
| --- | --- | --- | --- |
| `finance@buildwithwitness.com` | Finance operations | Invoices, payments, receipts, subscriptions, billing, purchase orders and vendor registration | Accounting/billing system |
| `support@buildwithwitness.com` | Customer operations | Customer support, onboarding, access issues, product questions and trials | Helpdesk/ticket system |
| `contracts@buildwithwitness.com` | Commercial/legal operations | Contracts, procurement, NDAs, MSAs, SOWs, DPAs, institutional agreements and renewals | Contract lifecycle/procurement system |
| `engineering@buildwithwitness.com` | Engineering operations | Production/infrastructure, integrations, APIs, escalations, client IT, SSO and domain configuration | Engineering operations workflow |
| `security@buildwithwitness.com` | Security lead | Vulnerability reports, questionnaires, responsible disclosure and institutional cybersecurity contact | Dedicated security workflow |
| `privacy@buildwithwitness.com` | Privacy/data governance | Privacy questions, data requests, governance, retention/deletion and assessments | Privacy/data governance workflow |
| `hello@buildwithwitness.com` | Commercial operations | General and sales enquiries, partnerships and design-partner enquiries | CRM/commercial enquiry system |

These are role aliases, not independent Cloudflare mailboxes. Do not use them as
application accounts or create corresponding Witness database users.

## Routing architecture

```text
buildwithwitness.com
       |
Cloudflare Email Routing
       |
departmental role address
       |
verified operational inbox
```

All seven aliases may initially forward to the single verified destination
provided at execution time as `WITNESS_EMAIL_ROUTING_DESTINATION`. The repository
must never contain its value.

Before DNS onboarding, inspect public and Cloudflare DNS for existing MX, SPF,
DKIM and DMARC records. If MX records identify another provider, stop and plan a
mail migration; do not enable Email Routing or replace those records. The
repository utility never changes DNS and never enables or modifies catch-all.

## Operator procedure

1. Create a scoped token using the permissions in
   `scripts/cloudflare/README.md`.
2. Export the four variables from `.env.example` through a secret manager.
3. Run `pnpm cloudflare:email:inspect` and retain the sanitized plan in the
   change log.
4. If Email Routing is not ready, inspect MX and onboard it separately in
   Cloudflare only after resolving provider conflicts.
5. Run `pnpm cloudflare:email:apply`. If verification is requested, verify the
   destination inbox and run inspect/apply again.
6. Require the final `VERIFIED` section listing all seven addresses.

## Security

- Never commit the Cloudflare API token; use least privilege and a scoped API
  token, not the Global API Key.
- Verify destination addresses before creating forwarding rules.
- Prefer departmental role addresses over personal addresses and avoid
  publishing personal staff email addresses.
- Log sanitized administrative changes and retain the dry-run/final reports.
- Rotate/revoke the apply token after the change if it is not needed for ongoing operations.

## Future architecture

The aliases can later route independently without changing the public contact
surface: `finance@` to accounting/billing, `support@` to a helpdesk,
`contracts@` to contract lifecycle/procurement, `engineering@` to engineering
operations, `security@` to a dedicated security workflow, `privacy@` to privacy
and data governance, and `hello@` to CRM/commercial enquiries. Any transition
must be planned as an explicit rule change with destination verification and an
auditable dry run.
