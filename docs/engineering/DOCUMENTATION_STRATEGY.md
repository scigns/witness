# Documentation Strategy

**Owner:** Documentation Lead
**Status:** Active

---

## Position

**Documentation drift is a defect**, tracked and fixed like any other. Undocumented behaviour is
unshipped behaviour.

This is stronger than most projects and it is deliberate. Witness will be operated by people we will
never meet, in institutions we will never visit, possibly after everyone who built it has moved on.
The documentation *is* the handover, and there will not be a second one.

## Rules

1. **Documentation ships in the same pull request as the change.** Not the next one. A behaviour
   change with no documentation update fails CI.
2. **Write for someone who is not you** — no assumed context, no institutional shorthand, no
   "obviously".
3. **Show the real command and the real output.** Examples that were never run are worse than none.
4. **Say what does not work.** Known limitations, honestly stated, build more trust than a polished
   surface that fails on contact.
5. **Diagrams are Mermaid, in-repo.** No binary formats, no external tools, no image that drifts from
   the prose beside it.
6. **One home per fact.** Duplication guarantees divergence. Link instead.

## Documentation types

Following the [Diátaxis](https://diataxis.fr/) framework — the four types serve different needs and
mixing them serves none.

| Type | Answers | Lives in |
|---|---|---|
| **Tutorial** | "Teach me by doing" | `docs/guides/`, `examples/` |
| **How-to** | "How do I accomplish X?" | `docs/guides/`, `docs/operations/` |
| **Reference** | "What exactly does this do?" | `docs/guides/API_GUIDE.md`, generated specs |
| **Explanation** | "Why is it like this?" | `architecture/`, `docs/governance/` |

The most common documentation failure is answering a "how do I" question with an explanation, or a
"why" question with a procedure. Know which one you are writing.

## Audiences

| Audience | Needs | Primary documents |
|---|---|---|
| **Contributor** | How to build and how we work | `CONTRIBUTING.md`, `docs/engineering/` |
| **Operator** | Install, run, back up, recover | `docs/operations/` |
| **Administrator** | Configure tenants, consent, retention | `docs/operations/ADMIN_GUIDE.md` |
| **End user** | Do their job in the product | `docs/guides/USER_GUIDE.md` |
| **Integrator** | Build against the API | `docs/guides/API_GUIDE.md`, `sdk/` |
| **Evaluator** *(procurement, security, legal)* | Can we trust and adopt this? | `VISION.md`, `SECURITY.md`, `docs/governance/` |
| **Data subject** | What is recorded about me, and what can I do? | Plain-language consent material |

The **data subject** is an audience most projects would not list. Consent that people cannot
understand is not consent, so plain-language material is a product requirement, not a marketing task.

## Standards

- **Plain language.** Short sentences. Active voice. Define a term the first time you use it.
- **Reading level:** aim for a general professional audience, not a specialist one. End-user and
  consent material is written for a broader audience still.
- **British English** in prose; American spelling in code identifiers where an ecosystem convention
  requires it (`color`, `serialize`).
- **Second person** for instructions. "You will need…", not "the user must…".
- **Every document has a header:** owner, status, last reviewed.
- **No screenshots where text will do.** Screenshots go stale silently and are inaccessible to
  screen readers; when necessary, they carry alt text and a text description.

## Maintenance

| Trigger | Action |
|---|---|
| Behaviour change | Documentation updated in the same PR — CI gate |
| Release | `STATUS.md`, `ROADMAP.md`, `CHANGELOG.md`, upgrade notes |
| Quarterly | Documentation Lead reviews for staleness against a checklist |
| A user asks a question the docs should have answered | **`type:docs` issue** — this is a defect |
| Onboarding takes too long | Defect in the documentation, not in the newcomer |

That last pair is the most important cultural point here. When someone cannot find an answer, the
documentation failed, not the person. Treating it that way is what keeps documentation honest.

## Automated checks

| Check | Blocks merge |
|---|---|
| markdownlint | Yes |
| Link check (internal and external) | Yes |
| Behaviour change without documentation | Yes |
| Mermaid diagrams render | Yes |
| Document header present | Yes |
| Spelling (with a project dictionary) | Warning |

## Generated documentation

Generated from source, never hand-maintained: REST reference (from OpenAPI), GraphQL schema
reference (from SDL), event reference (from AsyncAPI), SDK reference, configuration reference (from
the config schema), metrics reference.

**If it can be generated, it must be** — hand-written reference documentation is drift waiting to
happen.

## Translation

English is the source. Community translations are welcome and credited.

Priority order when resources are limited: consent and data-subject material first, then user guide,
then admin guide. **Consent material is the highest priority for translation** — someone who cannot
read the consent explanation in their own language has not meaningfully consented, which makes this
a
correctness requirement rather than a reach goal.

## Documentation site

Phase 6 deliverable. Content first, presentation later. Built from this repository, self-hostable,
and included in the offline bundle so air-gapped operators have the full documentation set locally.
