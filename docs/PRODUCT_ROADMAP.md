Witness Product Roadmap

Version: 1.0
Status: Active
Primary audience: Founder, product owners, partners, funders, pilot organisations, and engineering leads
Owner: Founder / Product Lead  



1. Product Vision

Witness is an open-source institutional memory platform for co-design, consultations, meetings, workshops, parliamentary discussions, and community engagement.

Witness helps organisations retain the knowledge created in conversation.

It transforms consented evidence into:





transcripts;



summaries;



actions;



decisions;



commitments;



connected institutional memory;



traceable answers to future questions.

The product is successful when organisations can remember, learn, and make decisions without losing context between meetings, projects, staff, and generations.





2. Product Problem

Governments, communities, regional organisations, development partners, and civil society conduct large numbers of consultations and workshops.

Knowledge is often lost because:





notes are inconsistent;



recordings are difficult to reuse;



staff leave;



documents remain fragmented;



commitments are not tracked;



communities are consulted repeatedly without clear memory of prior engagement;



AI services may extract knowledge into systems the institution does not control.

Witness addresses this by making institutional memory a continuing organisational capability rather than a one-off meeting output.





3. Product Promise

For facilitators:



Run a co-design session, capture consented evidence, reduce note-taking work, and produce trustworthy outputs.

For participants:



Know what is being captured, how it may be used, and how the resulting record can be reviewed.

For organisations:



Preserve searchable, traceable institutional knowledge under organisational control.

For decision-makers:



See what was discussed, decided, promised, and left unresolved, with evidence.





4. Priority Users



Facilitator

Needs to prepare sessions, manage participants and consent, capture evidence, review AI outputs, and produce reports.

Participant or Community Representative

Needs clear consent, accessible participation, respectful representation, and confidence that statements will not be misused.

Policy or Programme Officer

Needs searchable history, actions, decisions, commitments, and evidence.

Organisation Administrator

Needs secure access, membership, roles, retention, audit, and deployment control.

Reviewer or Knowledge Steward

Needs to validate transcripts, summaries, actions, decisions, and sensitive knowledge.

Executive or Decision-maker

Needs concise, traceable outputs rather than raw transcripts.





5. Core Jobs to Be Done





Prepare a workshop without managing several disconnected tools.



Explain and record participant consent.



Capture audio and documents without losing source information.



Generate a useful first draft of meeting outputs.



Correct and approve AI-generated content.



Track actions and decisions.



Find previous discussions and commitments.



Export trustworthy results.



Retain data under organisational control.



Reuse knowledge without repeating consultation unnecessarily.





6. Product Principles



Consent before intelligence

No AI convenience overrides participant rights or agreed use.

Evidence before assertion

Important outputs must remain traceable to source evidence.

Human confirmation

AI proposes; authorised people confirm.

Sovereignty by design

Organisations control data, deployment, retention, models, and access.

Useful before comprehensive

Ship the smallest trustworthy workflow that users can test.

Accessible participation

The product must work for different languages, abilities, devices, levels of connectivity, and forms of participation.

Open and replaceable

Core infrastructure and AI dependencies should be open source or replaceable through clear interfaces.

Memory, not surveillance

Witness exists to preserve legitimate institutional knowledge, not to create hidden monitoring.





7. Product Milestones



Product Milestone A — Enter a Trusted Workspace



User outcome

A user can securely enter an authorised organisation and workspace.

Includes





organisation;



workspace;



users and memberships;



roles;



authentication;



authorisation;



audit.



Evidence of success





a new user can be onboarded;



access boundaries are understandable;



unauthorised access is denied;



administrators can manage membership without developer assistance.





Product Milestone B — Prepare a Co-design Session



User outcome

A facilitator can prepare a real session inside Witness.

Includes





session creation;



purpose and objectives;



agenda;



facilitator;



participant list;



language and accessibility needs;



session dashboard.



Evidence of success

A facilitator can replace their basic workshop setup spreadsheet or document with Witness.





Product Milestone C — Capture Consent and Evidence



User outcome

Participants understand and control how their contributions are captured and used.

Includes





consent statement and version;



participant consent response;



recording permission;



withdrawal or restriction;



audio upload;



browser recording;



document and image upload;



evidence register;



provenance.



Evidence of success

A facilitator can demonstrate who consented to what, and every captured item has a clear origin and permitted use.





Product Milestone D — Produce Reviewable Intelligence



User outcome

Witness reduces post-workshop note-taking while keeping a human in control.

Includes





transcription;



summary;



actions;



decisions;



evidence references;



review queue;



edit, confirm, and reject;



model and prompt provenance.



Evidence of success

A facilitator obtains a useful first draft and can turn it into an approved record faster than manual note-taking.





Product Milestone E — Retrieve Institutional Memory



User outcome

Users can discover previous discussions and inspect the evidence.

Includes





session search;



filters;



timeline;



evidence traceability;



cross-session retrieval;



incremental knowledge graph relationships.



Evidence of success

A user can answer “Have we discussed this before?” and verify the answer.





Product Milestone F — Share and Act



User outcome

Workshop outputs become useful beyond the session.

Includes





export;



action and decision registers;



briefing output;



community feedback;



outcome follow-up;



audit explorer.



Evidence of success

An approved output can be shared, acted upon, and revisited without reconstructing context manually.





Product Milestone G — Sovereign Pilot Deployment



User outcome

A pilot organisation can operate Witness safely in its chosen environment.

Includes





local or private deployment;



backup and restore;



administrator controls;



retention and deletion;



monitoring;



model selection;



security hardening;



deployment documentation.



Evidence of success

A pilot organisation can run Witness without depending on the founder for routine operation.





8. MVP Scope

The MVP must support one complete co-design workshop.

Mandatory MVP journey:





sign in;



select an organisation and workspace;



create a session;



add participants;



capture consent;



upload or record audio;



generate a transcript;



generate a summary;



extract actions and decisions;



review and confirm outputs;



search the session;



export the approved result.

The MVP does not require every future institutional-memory feature.





9. Explicitly Out of Scope Before MVP Validation

Unless a pilot requires them, defer:





full government-wide federation;



complex autonomous agents;



complete policy ontology;



advanced graph inference;



native mobile applications;



full offline replication;



extensive third-party integrations;



predictive recommendations;



executive analytics suites;



multi-region high availability;



large-scale public access;



unrestricted automated decision-making.

These may appear in the long-term vision but must not delay real-user testing.





10. Pilot Strategy



Pilot 1 — Founder-led Internal Session

Purpose:





prove the end-to-end workflow;



identify obvious defects;



measure processing time;



test consent language;



assess whether outputs are useful.

Success condition:

A complete session is captured, reviewed, searched, and exported.

Pilot 2 — Trusted Facilitator

Purpose:





observe onboarding;



test usability without developer knowledge;



identify confusing workflow;



assess trust and editing behaviour.

Success condition:

The facilitator completes the workflow with limited assistance and chooses to use Witness again.

Pilot 3 — Partner Organisation

Purpose:





test roles, data boundaries, retention, and operational value;



collect institutional feedback;



identify deployment requirements.

Success condition:

The organisation agrees that Witness solves a meaningful problem and identifies a path to continued use.





11. Product Metrics



North-star metric

Number of completed co-design sessions whose approved outputs are later retrieved or reused.

This measures capture, trust, institutional memory, and continuing value.

MVP metrics

Track:





sessions created;



sessions completed;



participants recorded;



consent completion rate;



evidence items captured;



successful transcription rate;



percentage of AI suggestions edited, confirmed, or rejected;



time from upload to approved output;



facilitator time saved;



searches performed;



exported outputs;



critical failures;



users willing to use Witness again.



Initial validation targets

These targets guide learning rather than prove scale:





3 completed real sessions;



2 facilitators;



at least 20 participant records;



consent recorded for every processed participant contribution;



at least 80% successful processing of valid audio uploads;



one approved summary, action list, and decision record per session where relevant;



at least one prior session retrieved during later work;



no unresolved critical consent, access, or data-loss defect.





12. Product Learning Questions

During pilots, answer:





Which part of workshop preparation consumes the most time?



Does Witness make consent clearer or more burdensome?



Is uploading audio sufficient, or is browser recording essential?



How accurate must transcription be before it becomes useful?



Which AI outputs save the most time?



What do facilitators always edit?



What information is too sensitive to process?



Which search questions are asked first?



Do users trust evidence links?



What must remain local or sovereign?



Which languages and accessibility needs are highest priority?



What would make a facilitator choose Witness for the next workshop?

Roadmap changes should be based on these answers.





13. Product Decision Rules

Prioritise a capability when it:





unlocks the end-to-end MVP workflow;



prevents data loss;



protects consent or access;



removes a major facilitator burden;



makes outputs more trustworthy;



enables real-user testing;



addresses repeated pilot feedback.

Deprioritise a capability when it:





is primarily architectural prestige;



anticipates scale not yet observed;



duplicates mature open-source infrastructure;



serves no current user journey;



requires extensive work before any user benefit;



can be handled manually during early pilots without material risk.





14. Release Horizon



Horizon 1 — Usable Workshop MVP

Deliver the mandatory MVP journey and complete internal and trusted-facilitator pilots.

Horizon 2 — Institutional Memory Pilot

Strengthen search, traceability, action and decision tracking, and cross-session retrieval.

Horizon 3 — Organisational Deployment

Strengthen administration, retention, sovereign deployment, model control, observability, backup, and support.

Horizon 4 — Regional Digital Public Infrastructure

Explore federation, interoperable schemas, regional governance, multilingual expansion, and sustainable open-source stewardship only after product validation.





15. Founder Responsibilities

The founder should:





select pilot users;



approve scope changes;



review each capability as a user;



test the application after each meaningful merge;



record product feedback;



prevent architecture from becoming the output;



protect constitutional principles;



decide when manual work is acceptable for a pilot;



maintain partner and community relationships;



measure whether Witness is solving a real problem.

Engineering owns implementation. The founder owns learning and priority.





16. Product Readiness

Witness is ready for a public or funded pilot only when the mandatory release gate in MVP_CHECKLIST.md is satisfied.

A feature list alone does not establish readiness.
