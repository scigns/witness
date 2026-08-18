# Client Onboarding Runbook

**Status:** Active
**Owner:** Infrastructure Lead

How to bring on a new client, start to finish, without SQL, Prisma, or
direct database changes. Pair with
[`../release/CLIENT_ROLLOUT_PROFILES.md`](../release/CLIENT_ROLLOUT_PROFILES.md)
for profile-specific defaults (SPC/FTA/MOJ/Church), and
[`PILOT_OPERATIONS.md`](PILOT_OPERATIONS.md) for the underlying commands
this runbook sequences.

Every real institutional client gets its own deployment (see
`PILOT_OPERATIONS.md`'s "Data portability" section for why). This runbook
assumes a freshly deployed, freshly migrated instance with no organisation
yet — the state `docker compose … run --rm api pnpm --filter @witness/api
exec prisma migrate deploy` leaves it in.

No secrets appear in this document. Every value below is a placeholder;
real values come from the operator's own secret store.

## 1. Create the organisation, assign the profile, assign the first admin, configure quota

These four are one step: the one-time bootstrap. It refuses to run against a
database that already holds an organisation, and it is the only
administrative action in Witness performed outside the HTTP API.

```bash
docker compose -f deployments/cloud-managed/docker-compose.pilot.yml \
  --env-file .env run --rm \
  -e WITNESS_BOOTSTRAP_ORGANISATION_NAME="<Client institution name>" \
  -e WITNESS_BOOTSTRAP_ADMIN_EMAIL=<admin's verified email> \
  -e WITNESS_BOOTSTRAP_ADMIN_NAME="<admin's name>" \
  api pnpm bootstrap
```

This creates the organisation at the default 5 GB quota and invites the
named person as that organisation's `admin`. It also grants them a
`platform`-scope `admin` role — the mechanism that lets them create further
organisations or adjust settings through the application afterwards, so no
second bootstrap or developer action is needed for anything past this point.

The institutional profile (`spc`/`fta`/`moj`/`church`) and a non-default
quota are set through the application once the admin signs in — **Create
organisation** on the Organisations page — not through bootstrap, which
takes no profile argument. If bootstrap already created the organisation
without the right profile, do not edit the database; the admin can create
the correctly-profiled organisation through the UI and the empty
bootstrap one can be left unused or renamed.

## 2. First admin signs in

The invited admin visits the deployment's URL, chooses **Sign in**, and
authenticates through the identity provider with the same verified email.
Witness activates the account and links it on that first sign-in — nothing
further to do.

## 3. Create the first program and session

Through the application, signed in as the admin:

1. **Workspaces** → create the first workspace (the "program" — see the
   profile's recommended structure in `CLIENT_ROLLOUT_PROFILES.md`).
2. Add yourself as an **active** workspace member with a role (typically
   `admin` or `facilitator`).
3. **Sessions** → create the first session under that workspace.
4. **Open** the session.

## 4. Add users

For each additional person:

1. An administrator creates them in Keycloak (or federates the
   institution's directory) with a **verified** email.
2. Invite them into the organisation:

```bash
docker compose … run --rm \
  -e WITNESS_INVITE_ORGANISATION="<Client institution name>" \
  -e WITNESS_INVITE_EMAIL=<their email> \
  -e WITNESS_INVITE_NAME="<their name>" \
  -e WITNESS_INVITE_ROLE=<admin|facilitator|contributor|reviewer|participant|reader> \
  api pnpm invite
```

1. They sign in once through the identity provider to activate the account.
2. An administrator adds them to the relevant workspace, with a role, on the
   workspace page — see `CLIENT_ROLLOUT_PROFILES.md` for the recommended
   roles per profile.

## 5. Verify permissions

Signed in as a non-admin role you just created, confirm:

- They can see only the workspace(s) they were added to, not others.
- A `reader`/`participant` cannot create a session or capture evidence.
- A `contributor`/`facilitator` cannot approve or publish a report.
- Only an `admin` can manage membership and roles.

This is the same shape as the security smoke test
(`scripts/pilot/security-smoke.mjs`) — run it against the new deployment if
you want it asserted rather than eyeballed.

## 6. Verify storage

Capture one piece of evidence with an attachment (audio — attach a file or
record in browser — or a document/image) as a `contributor`/`facilitator`
and confirm:

- It uploads and appears on the session.
- `GET /api/v1/organisations/<id>/usage` (or the organisation's usage page)
  reflects the new usage against the 5 GB quota.
- Deleting it releases the quota back (see `01d8014` — the R2 object is
  deleted with the resource, not orphaned).
- For a document or image specifically: attaching it to evidence with a
  named source participant requires that participant's `evidence_submission`
  consent granted — try it once denied (confirm a clear refusal, nothing
  written) and once granted (confirm it attaches), per
  `CLIENT_ROLLOUT_PROFILES.md`'s note on the category.

## 7. Run the first synthetic test

Do not use real participant data for this step. Walk one session through
the whole workflow with placeholder content:

create session → add a participant → capture consent → capture evidence
(a short recording or note) → transcript → review → summary → a decision
or action → export (HTML or Markdown).

This mirrors `scripts/pilot/browser-walkthrough.mjs`'s 33-step path; running
that script against the new deployment's URL is the automated equivalent if
you'd rather not click through by hand.

## 8. Approve the client for use

Before telling the client this deployment is theirs to use for real
sessions:

- [ ] Steps 5–7 above passed.
- [ ] Backup is scheduled (`crontab -l` shows the daily `scripts/pilot/backup.sh`
  entry — see `PILOT_OPERATIONS.md`'s "Backup" section) and
  `scripts/ops/backup-status.sh` reports `STATUS: OK`.
- [ ] The institutional profile matches what was agreed with the client (SPC/FTA/MOJ/Church).
- [ ] For MOJ specifically: legal/compliance sign-off on the consent basis is on file — see `CLIENT_ROLLOUT_PROFILES.md`.
- [ ] The client knows this is now real institutional memory, not a sandbox.

Only after this checklist is real client data approved for this deployment.

## 9. Roll back / remove synthetic data if onboarding fails

If step 7's synthetic walkthrough (or an earlier step) fails and the
deployment needs to be reset before real use:

- **Before any real client data exists**, the simplest rollback is to tear
  down and re-provision: stop the stack, drop and recreate the Postgres
  volume, re-run migrations, and re-bootstrap. This is safe precisely
  because nothing real has been recorded yet — confirm that with
  `SELECT count(*) FROM participant_consent_record` (0) before doing it, not
  after.
- **If real client data already exists** alongside the failed synthetic
  test, do not drop the database. Instead restore the pre-onboarding backup
  taken in step 1 (`scripts/ops/restore.sh`, which refuses to overwrite a
  live database unless `WITNESS_RESTORE_CONFIRM` names it explicitly), then
  redo onboarding from the step that failed.
- Either way, this is the one point in onboarding where a database-level
  action is legitimate — it is a deployment reset, not a workaround for a
  missing application feature, and it happens before the client is live.
