# Personas

**Owner:** Product Director & UX Lead
**Status:** Draft v0.1 — to be validated by field research in Phase 1
**Health warning:** these are **hypotheses**, built from public-sector experience and desk research,
not yet from interviews. Treating them as findings would be exactly the mistake the Research Lead role
exists to prevent. Each will be revised or discarded against real evidence.

---

## Primary

### Amara — Ministerial policy officer

*The persona whose success or failure determines the product's.*

Mid-career, 200+ meetings a year, writes briefings under time pressure. Not technical, highly literate,
works in Word and email. Inherits policy areas from people who have left.

**Core need:** *"What did we already decide about this, and why?"*
**Today:** searches shared drives, emails colleagues who might remember, sometimes recreates analysis
that already exists.
**Success:** finds a three-year-old decision with its rationale and the evidence behind it, in minutes.
**Fails us if:** search returns transcripts instead of answers, or she cannot tell whether something
is
confirmed or an AI guess.

### Tomas — Committee clerk

Formal legal obligations for the accuracy of the record. Detail-oriented, low tolerance for error,
accountable if the record is wrong.

**Core need:** an accurate, attributable, redactable, publishable record.
**Success:** produces the formal record faster, with attribution he can defend.
**Fails us if:** speaker attribution is wrong, redaction is incomplete, or he cannot see where a claim
came from.

### Grace — Community engagement lead

Works in the field. Poor connectivity. Records consultations in halls, on country, in people's homes.
Cares deeply about whether community input actually changes anything.

**Core need:** prove that what communities said shaped the outcome.
**Today:** notes on paper, recordings on her phone, a summary written days later from memory.
**Success:** captures offline, syncs later, shows a community the commitments made to them and their
status.
**Fails us if:** capture fails in the field and a recording is lost — often irreplaceable, because the
meeting will not reconvene.

### Joseph — Indigenous knowledge custodian

*The highest trust bar in the system.*

Holds authority under customary law for what community knowledge may be recorded, by whom, and who may
see it. Has decades of experience of knowledge being taken and not returned.

**Core need:** control that is real, verifiable and permanent — including against administrators.
**Success:** community-level consent works, restrictions hold, withdrawal is total, and he can verify
it rather than being asked to trust.
**Fails us if:** control is a promise rather than a mechanism, or if consent is modelled as an
individual choice when it is not.

### Priya — Platform operator

*A first-class persona, not an afterthought.*

Two-person IT team in an under-resourced agency. Runs twelve other systems. Was not consulted about
adopting Witness.

**Core need:** install it, back it up, upgrade it, restore it — from documentation, without calling
us.
**Success:** working instance in a day; a restore drill that works; alerts that come with runbooks.
**Fails us if:** the stack is too complex to operate, a backup cannot be restored, or an alert fires
at
2am with no runbook.

## Secondary

### David — Programme manager

Five-year development programme, three staff cohorts. Needs commitments tracked across years and
handovers. **Success:** commitments made in 2027 are still visible and closable in 2032.

### Fatima — Auditor / Ombudsman

Infrequent user, high stakes, read-only. Reconstructs decision chains years later.
**Success:** follows a decision to the exact words spoken, with tamper-evident provenance.
**Fails us if:** the chain has gaps, or she cannot distinguish confirmed record from AI inference.

### Rita — Data subject

*May never log in. Her rights must work anyway.*

Attended one consultation. Wants to know what was recorded about her and to be able to withdraw it.
**Success:** understands the consent she gave, in her own language; can see her data; can withdraw
easily.
**Fails us if:** withdrawal is harder than consenting, or the consent explanation was in a language
she
does not read.

### Sam — Integrator

Contractor building a connector to the department's records system. Will have left before it needs
maintenance. **Success:** stable REST API, generated SDK, documentation that works.

---

## Design implications

| Persona | Non-negotiable |
|---|---|
| Amara | Answers, not transcripts. Confidence and provenance always visible |
| Tomas | Attribution accuracy. Complete redaction |
| Grace | **Offline capture that never loses data** |
| Joseph | **Control enforced above administrators, verifiable in source** |
| Priya | **Operable by two people from documentation alone** |
| Rita | **Rights that work without an account** |

## Anti-personas

We are **not** building for: an executive wanting a dashboard of who spoke most; a manager wanting to
monitor staff; a communications team wanting talking points; a vendor wanting to analyse citizens
across institutions.

Recording anti-personas is as useful as recording personas. Requests that serve these are declined,
and naming them in advance makes declining fast and consistent rather than a fresh argument each time.
