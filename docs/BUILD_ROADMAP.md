Witness Build Roadmap

Version: 1.0
Status: Active
Mode: Continuous Product Delivery
Primary audience: Claude Code and engineering contributors
Owner: Founding Product Engineer / Technical Lead  



1. Purpose

This document defines the order in which Witness should be built.

It is an execution document, not a strategy paper and not an architecture gate.

The objective is to move Witness from its current Developer Preview into a usable MVP that can support a real co-design workshop.

Working software is the primary measure of progress.

Architecture evolves through implementation. Documentation follows working software. Significant decisions are recorded through ADRs when necessary.





2. Authoritative Sources

Use the following sources in this order:





PRODUCT_CONSTITUTION.md



BUILD_AUTHORIZATION.md



PRODUCT_ROADMAP.md



BUILD_ROADMAP.md



MVP_CHECKLIST.md



Accepted ADRs



Current implementation on main



Existing automated tests

The repository is the source of truth.

Do not invent missing authorities. Do not reference documents or ADRs that do not exist.

When documentation and implementation differ:





preserve constitutional principles;



treat current working software and tests as the operational baseline;



update affected documentation in the same PR;



create an ADR only when a durable architectural decision is being made.

Incomplete planning documentation must not block implementation.





3. Operating Model

Witness operates through two parallel tracks.

Track A — Product Delivery

Allocate approximately 90% of effort to:





usable capabilities;



complete vertical slices;



facilitator workflows;



real-user testing;



defects that block use;



measurable reductions in facilitator effort.



Track B — Architecture and Governance

Allocate approximately 10% of effort to:





ADRs for significant decisions;



documentation directly affected by code changes;



security, privacy, consent, provenance, and accessibility requirements;



a short architecture review after every five merged capabilities or once each week.

Architecture supports delivery. It does not become a separate prerequisite phase.





4. Current Baseline

At the time this roadmap was adopted:





the Developer Preview supports a narrow capture, review, confirmation, and tamper-evident audit workflow;



Organisations have been implemented and merged;



Workspaces have been implemented in PR #18 and must be verified as merged before beginning the next capability;



the expected next capability after Workspaces is Users and Roles.

Always verify current main, open PRs, and the latest merged capability before starting work.

Do not duplicate a capability that already exists on an open branch or PR.





5. MVP User Journey

The shortest complete Witness journey is:





A user signs in.



The user enters an organisation and workspace.



A facilitator creates a co-design session.



Participants are added.



Consent is recorded.



Audio or other evidence is captured or uploaded.



Witness creates a transcript.



Witness creates a summary.



Witness extracts actions and decisions.



The facilitator reviews and confirms the outputs.



Previous sessions can be searched.



Results can be exported.

Every build decision should reduce the time required to complete this journey.





6. Definition of a Vertical Slice

A capability is complete only when a user can exercise it through the application.

Where applicable, every capability includes:





domain behaviour;



database schema and migration;



service and API;



frontend workflow;



authentication and authorisation;



provenance and audit behaviour;



validation and error states;



automated tests;



affected documentation;



manual verification.

Avoid horizontal work that creates infrastructure without a usable product outcome.

A capability may omit a layer only when that layer is genuinely irrelevant. The PR must explain why.





7. Build Sequence



Milestone 0 — Stabilise the Current Baseline



Outcome

The repository is clean, current, and ready for the next vertical slice.

Required actions





Verify PR #18 status.



If merged, pull current main.



If not merged, do not duplicate the Workspaces capability.



Run the repository verification suite.



Confirm Organisations and Workspaces operate through the UI and API.



Update the Current Baseline section if repository state has changed.



Exit criteria





main is green;



no overlapping feature PR is open;



Organisations and Workspaces are usable;



the next incomplete capability is identified.





Milestone 1 — Secure Entry into Witness



User outcome

A real person can securely enter Witness and access only the organisations and workspaces they are permitted to use.

Build order



1.1 Users and Memberships

Build:





user profile;



organisation membership;



workspace membership;



membership status;



invitation state;



list and detail views;



create or invite flow;



audit events for membership changes.

Acceptance criteria:





an administrator can invite or register a user;



a user can belong to one or more organisations;



workspace access is explicit;



duplicate memberships are prevented;



membership changes are auditable.



1.2 Roles and Permission Assignment

Build:





role definitions;



assignment at organisation or workspace scope;



least-privilege defaults;



administrator, facilitator, contributor, reviewer, participant, and read-only roles where supported by the Constitution;



permission tests.

Acceptance criteria:





permissions are enforced server-side;



UI visibility does not replace API enforcement;



invalid or invented roles are rejected;



role changes are audited.



1.3 Authentication

Integrate the repository-approved identity approach.

Expected outcome:





sign in;



sign out;



session validation;



user identity mapped to the domain;



local development setup;



failure and expiry handling.

Do not build a custom identity provider if the accepted architecture specifies an existing open-source system.

1.4 Authorisation

Enforce action and resource policies at API boundaries.

Acceptance criteria:





organisation and workspace isolation;



role and scope checks;



deny-by-default behaviour;



adversarial tests;



no reliance on client-provided role claims without validation.



Milestone exit criteria





a real user can authenticate;



a user sees only authorised organisations and workspaces;



an administrator can manage membership and roles;



cross-tenant access tests fail safely.





Milestone 2 — Prepare a Co-design Session



User outcome

A facilitator can prepare a real workshop inside Witness.

Build order



2.1 Co-design Session

Build:





create, view, edit, archive;



organisation and workspace ownership;



title, purpose, date, location, format, language, status, and facilitator;



draft, scheduled, active, completed, and archived states;



audit and provenance.



2.2 Agenda and Objectives

Build:





session objectives;



agenda items;



ordering;



time allocation;



facilitation notes;



printable or exportable session brief.



2.3 Participants

Build:





participant records;



invitation or attendance state;



optional organisation and community affiliation;



preferred name;



accessibility and language needs;



privacy-aware contact handling.



2.4 Facilitator Dashboard

Build one coherent session screen showing:





session status;



agenda;



participants;



consent status;



evidence count;



processing status;



findings, actions, and decisions;



clear next action.



Milestone exit criteria

A facilitator can prepare and open a session without using external spreadsheets or notes for core setup.





Milestone 3 — Consent and Evidence Capture



User outcome

A facilitator can capture workshop evidence while respecting participant rights.

Build order



3.1 Consent

Build:





configurable consent statement;



participant response;



consent scope;



date, version, and method;



withdrawal or restriction;



recording permission;



use and sharing restrictions;



audit and provenance.

Acceptance criteria:





evidence processing cannot silently exceed consent;



withdrawn consent is visible;



consent records are immutable or versioned;



ambiguous consent fails safely.



3.2 File Upload

Build:





audio upload first;



document and image upload second;



metadata;



file integrity hash;



upload progress and failure recovery;



storage adapter compatible with local and sovereign deployments.



3.3 Browser Audio Capture

Build only after file upload is reliable.

Include:





start, pause, resume, stop;



clear recording indicator;



consent confirmation;



local recovery for interrupted uploads;



recording metadata.



3.4 Evidence Register

Build a session-level evidence list with:





source;



type;



owner or contributor;



capture time;



consent status;



processing status;



provenance;



access restrictions.



3.5 Offline Resilience

For MVP, implement the smallest safe form of offline resilience:





local draft preservation;



queued upload or retry;



visible sync state;



duplicate prevention.

Do not build a complete distributed offline architecture before real pilot evidence requires it.

Milestone exit criteria

A facilitator can run a session, record valid consent, and capture at least one audio file without losing provenance.





Milestone 4 — Generate Useful Meeting Intelligence



User outcome

Witness reduces the manual work required after a workshop.

Build order



4.1 Processing Job

Build:





queued processing;



status tracking;



retry;



failure reporting;



model and configuration provenance;



replaceable AI provider interface.



4.2 Transcription

Build:





open-source speech-to-text integration;



transcript segments;



timestamps;



language metadata;



confidence where available;



editable transcript;



original and revised versions.

Speaker diarisation is useful but must not delay an initial usable transcript.

4.3 Summary

Build:





concise meeting summary;



editable output;



evidence references;



model and prompt provenance;



explicit “AI-generated, human review required” status.



4.4 Action Extraction

Build:





action description;



owner where identified;



due date where identified;



source transcript reference;



confidence or review state;



confirm, edit, reject.



4.5 Decision Extraction

Build:





decision statement;



decision status;



participants or authority where available;



supporting evidence references;



confirm, edit, reject.



4.6 Human Validation Workflow

Build one review queue for:





transcript corrections;



summary approval;



action validation;



decision validation;



rejected AI suggestions;



final confirmation.

AI output must never become authoritative without a clear human confirmation path.

Milestone exit criteria

A facilitator can upload a workshop recording and produce a reviewed transcript, summary, actions, and decisions.





Milestone 5 — Retrieve and Reuse Institutional Memory



User outcome

Users can find what was previously discussed, decided, or promised.

Build order



5.1 Session Search

Start with simple, reliable search across:





session title and purpose;



transcript;



summary;



actions;



decisions;



participants where permitted;



dates and tags.

Use the simplest repository-approved search mechanism that meets MVP needs.

5.2 Filters and Timeline

Build:





organisation;



workspace;



date;



session;



person;



status;



evidence type;



decision or action state.



5.3 Evidence Traceability

A result must show:





originating session;



source evidence;



transcript location where applicable;



author or confirming reviewer;



processing and confirmation history.



5.4 Cross-session Questions

Implement retrieval-assisted questions only after search and traceability are reliable.

Answers must:





cite internal evidence;



distinguish facts from generated synthesis;



respect organisation, workspace, role, and consent boundaries;



avoid claims when evidence is insufficient.



5.5 Knowledge Graph

Do not make the full knowledge graph a prerequisite for MVP search.

Introduce graph-backed relationships incrementally when real user questions require:





person–organisation;



session–project;



decision–evidence;



commitment–owner;



policy–discussion;



action–outcome.



Milestone exit criteria

A user can answer “Have we discussed this before?” and inspect the evidence supporting the answer.





Milestone 6 — Export, Pilot, and Learn



User outcome

A facilitator can use Witness in a real workshop and share the result.

Build order



6.1 Export

MVP export priority:





structured JSON;



printable HTML or PDF;



Markdown;



DOCX only if pilot users require it.

Exports must preserve:





session identity;



consent and access notes where relevant;



transcript or summary status;



actions and decisions;



provenance references.



6.2 Pilot Administration

Build only what is required to support a small controlled pilot:





basic organisation administration;



pilot configuration;



audit explorer;



error visibility;



deletion or retention controls;



support diagnostics without exposing sensitive content.



6.3 Accessibility and Mobile Usability

Verify:





keyboard navigation;



labels and focus states;



contrast;



responsive session workflow;



usable capture flow on common mobile devices;



plain-language errors.



6.4 Pilot Feedback

Build or document a lightweight feedback mechanism capturing:





task completed;



time saved;



failure or confusion;



trust concern;



missing capability;



willingness to use again.



Milestone exit criteria

Witness has supported at least one complete real co-design session and produced actionable feedback.





Milestone 7 — Pilot Hardening

Complete after real use, not before.

Prioritise:





critical defects;



data loss prevention;



consent and access defects;



security vulnerabilities;



performance bottlenecks observed in pilot;



clearer onboarding;



deployment reproducibility;



backup and restore;



monitoring;



model replacement and local deployment.

Do not treat speculative enterprise features as MVP blockers.





8. Deferred Until Validated

Unless required by a pilot, defer:





complex microservice decomposition;



advanced workflow engines;



full multi-region high availability;



broad third-party integrations;



automated policy recommendation;



unrestricted autonomous agents;



complete ontology coverage;



advanced graph inference;



polished executive dashboards;



extensive theming;



native mobile applications;



full offline-first replication;



large-scale federation.

Record deferred ideas in the product backlog, not as active build gates.





9. Pull Request Workflow

For each capability:





Sync current main.



Check open PRs and avoid duplicate work.



Select one incomplete capability.



Verify only the dependencies relevant to that capability.



Create one feature branch.



Implement one vertical slice.



Run lint, typecheck, tests, build, and repository verification.



Start the application and manually verify the workflow.



Update affected documentation and MVP_CHECKLIST.md.



Open one PR.



Stop.

Do not begin the next capability while the current capability PR is open unless the founder explicitly authorises parallel work with non-overlapping ownership.





10. Branch Naming

Use short-lived feature branches.

Recommended patterns:





feat/identity/users-memberships



feat/identity/roles



feat/auth/keycloak



feat/authz/policy-enforcement



feat/sessions/create-session



feat/sessions/participants



feat/consent/participant-consent



feat/evidence/audio-upload



feat/ai/transcription



feat/ai/session-summary



feat/memory/search



fix/<area>/<description>

Do not create new long-lived domain branches for ordinary capabilities.





11. Definition of Done

A capability is done when:





acceptance criteria are met;



relevant constitutional requirements are preserved;



permissions are enforced;



audit and provenance are implemented where applicable;



database migrations are reproducible;



automated tests pass;



manual verification is recorded;



no critical TODO or placeholder remains;



documentation affected by the code is updated;



the PR clearly explains limitations and follow-up work;



the feature can be exercised by its intended user.





12. Stop Conditions

Stop implementation only for:





likely data loss;



a security or consent violation;



a direct conflict with the Product Constitution;



a required human product decision with materially different user outcomes;



missing credentials or infrastructure that cannot be replaced by a safe local option;



an overlapping open PR implementing the same capability;



failing baseline tests that cannot safely be attributed to the current work.

Do not stop solely because:





an unrelated planning document is incomplete;



an architecture document is a draft;



a future ontology is unfinished;



a non-blocking governance review remains open;



documentation could be improved;



an ideal production-scale solution is not yet available.





13. Architecture Review Cadence

Hold a lightweight architecture review:





once per week; or



after five merged capabilities; or



immediately when a significant cross-cutting decision is required.

Review:





emerging coupling;



security and consent risks;



repeated implementation patterns;



technical debt affecting delivery;



dependency health;



whether accepted ADRs still fit evidence from implementation.

The review may reprioritise work but should not pause normal delivery without a concrete risk.





14. MVP Completion

The MVP is complete only when every mandatory item in MVP_CHECKLIST.md is satisfied and a real facilitator has completed an end-to-end workshop workflow.

The MVP is not complete merely because all planned code has been merged.
