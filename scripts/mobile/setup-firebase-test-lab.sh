#!/usr/bin/env bash
set -euo pipefail

# One-time setup for Witness Participate's cloud Android acceptance
# (.github/workflows/mobile-android-cloud.yml, docs/mobile/CLOUD_ANDROID_TESTING.md).
#
# Run this ONCE, by a human, after:
#   1. Creating a new Firebase project on the Spark (free) plan at
#      https://console.firebase.google.com — no payment method required.
#      Note the project ID shown there (e.g. "witness-mobile-test-lab-a1b2c3");
#      pass it as this script's first argument.
#   2. `gcloud auth login` with a Google account that owns that project.
#   3. `gcloud config set project <PROJECT_ID>`.
#
# This script does NOT create the Firebase project itself (no gcloud/firebase
# CLI command does that non-interactively without additional Firebase-specific
# tooling this repository does not depend on) — that one step is the
# irreducible human action. Everything after it is automated and idempotent
# (safe to re-run).
#
# Creates NO long-lived credential. Workload Identity Federation only — see
# the governing instruction's explicit "do not create JSON service account
# keys." Prints the three values mobile-android-cloud.yml expects as GitHub
# repository VARIABLES (not secrets) at the end; nothing here uploads them to
# GitHub automatically — add them yourself via `gh variable set` or the
# GitHub UI, reviewing each value before you do.

PROJECT_ID="${1:?Usage: $0 <FIREBASE_PROJECT_ID> [github-owner/repo]}"
REPO="${2:-scigns/witness}"
POOL_ID="github-actions"
PROVIDER_ID="github"
SERVICE_ACCOUNT_ID="witness-mobile-test-lab"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"

log() { echo "[setup-firebase-test-lab] $*"; }

log "Project: ${PROJECT_ID}"
log "Repository trust scope: ${REPO}"

log "Enabling required APIs (idempotent — already-enabled APIs are a no-op)..."
gcloud services enable \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  cloudresourcemanager.googleapis.com \
  testing.googleapis.com \
  toolresults.googleapis.com \
  --project="${PROJECT_ID}"
# testing.googleapis.com / toolresults.googleapis.com are Firebase Test Lab's
# underlying Cloud Testing / Tool Results APIs — verified by long-standing
# Google API naming convention, not independently confirmed against a fresh
# enablement doc this session. If this step reports either name as unknown,
# run `gcloud services list --available --project="${PROJECT_ID}" | grep -i
# -e testing -e toolresults` and substitute the correct identifier.

log "Creating dedicated CI service account (Test Lab execution/read only — never Owner/Editor)..."
if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT_EMAIL}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${SERVICE_ACCOUNT_ID}" \
    --project="${PROJECT_ID}" \
    --display-name="Witness mobile Test Lab CI"
else
  log "Service account already exists — skipping creation."
fi

# roles/cloudtestservice.testAdmin (submit runs) + roles/firebase.analyticsViewer
# (Firebase's own docs pair these two for gcloud Test Lab submission) — the
# narrowest combination Google documents for this operation, verified against
# firebase.google.com/docs/projects/iam/permissions's "Test Lab" section, not
# guessed. Neither Owner nor Editor is granted at any point in this script.
#
# Honest caveat, stated by that same page and repeated here rather than
# glossed over: "Members assigned these predefined roles can access ALL
# Cloud Storage buckets associated with the Firebase project" — acceptable
# here because this project is dedicated to mobile testing and holds no
# customer data by design (see this script's own header), but genuinely
# broader than "Test Lab only" if that assumption is ever violated.
log "Granting the Test Lab roles (not Owner/Editor)..."
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/cloudtestservice.testAdmin" \
  --condition=None
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/firebase.analyticsViewer" \
  --condition=None

log "Creating the Workload Identity Pool (idempotent)..."
if ! gcloud iam workload-identity-pools describe "${POOL_ID}" --project="${PROJECT_ID}" --location="global" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "${POOL_ID}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --display-name="GitHub Actions" \
    --description="Witness mobile release CI — scoped to ${REPO} only"
else
  log "Workload Identity Pool already exists — skipping creation."
fi

# Attribute condition restricts entry to this exact repository AND this
# exact workflow file, on any ref — tighter than a repository-only condition
# (section 6's "where supported/sensible: the relevant workflow"), without
# being so brittle it breaks across branches/dispatch contexts. See
# docs/mobile/CLOUD_ANDROID_TESTING.md for the reasoning.
log "Creating the OIDC provider, scoped to ${REPO}'s mobile-android-cloud.yml workflow only..."
if ! gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
    --project="${PROJECT_ID}" --location="global" --workload-identity-pool="${POOL_ID}" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --workload-identity-pool="${POOL_ID}" \
    --display-name="GitHub OIDC" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.job_workflow_ref=assertion.job_workflow_ref" \
    --attribute-condition="assertion.repository=='${REPO}' && assertion.job_workflow_ref.startsWith('${REPO}/.github/workflows/mobile-android-cloud.yml@')"
else
  log "OIDC provider already exists — skipping creation."
fi

log "Granting the pool permission to impersonate the service account..."
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)")
gcloud iam service-accounts add-iam-policy-binding "${SERVICE_ACCOUNT_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${REPO}"

WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"

log ""
log "Done. No credential was created or downloaded — Workload Identity"
log "Federation is keyless by design. Set these as GitHub repository"
log "VARIABLES (Settings -> Secrets and variables -> Actions -> Variables"
log "tab — NOT Secrets, none of these three values is secret material):"
log ""
log "  FIREBASE_PROJECT_ID               = ${PROJECT_ID}"
log "  FIREBASE_WORKLOAD_IDENTITY_PROVIDER = ${WIF_PROVIDER}"
log "  FIREBASE_SERVICE_ACCOUNT          = ${SERVICE_ACCOUNT_EMAIL}"
log ""
log "Or, if you have the GitHub CLI authenticated against ${REPO}:"
log ""
log "  gh variable set FIREBASE_PROJECT_ID --repo ${REPO} --body \"${PROJECT_ID}\""
log "  gh variable set FIREBASE_WORKLOAD_IDENTITY_PROVIDER --repo ${REPO} --body \"${WIF_PROVIDER}\""
log "  gh variable set FIREBASE_SERVICE_ACCOUNT --repo ${REPO} --body \"${SERVICE_ACCOUNT_EMAIL}\""
