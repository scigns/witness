# ADR-0010: Transcription pipeline

| | |
|---|---|
| **Status** | Accepted (engine composition pending benchmark — open decision D-3) |
| **Date** | 2026-07-31 |
| **Deciders** | AI Lead, Principal Architect |
| **Related** | ADR-0009, ADR-0012 |
| **Principles engaged** | P1, P8 (accessible and multilingual) |

## Context

Transcription is the input to everything. Its quality bounds the quality of extraction, and its
timestamp precision bounds the precision of provenance.

The recordings are hard: multi-speaker meetings with crosstalk, variable microphone placement, room
noise, strong accent variation, code-switching between languages mid-sentence, and low-resource
languages with limited training data. This is materially harder than the podcast and dictation audio
most ASR benchmarks use, and we should not let benchmark numbers mislead us about field performance.

Three capabilities are needed and they are separable:

1. **Transcription** — speech to text
2. **Diarisation** — who spoke when
3. **Alignment** — word-level timestamps

Word-level timestamps are not a nicety. Provenance requires playing back the exact audio for an
assertion. Segment-level timestamps (±5 seconds) make "prove it" mean "listen to this vague region",
which materially weakens the product's central claim.

## Decision

> We will implement transcription behind `TranscriptionPort` using **Whisper**, composed as
> **faster-whisper** for transcription throughput, **WhisperX** for forced alignment and word-level
> timestamps, and **pyannote** (via WhisperX) for diarisation. Speaker labels are mapped to real
> identities by a separate, human-confirmed, auditable step.

Exact composition is pending benchmarking against target languages (open decision D-3). Because the
port boundary exists, that is a configuration decision rather than an architectural one — which is
why we can accept this ADR now without waiting for the benchmark.

## Options considered

### Option A — OpenAI Whisper reference implementation

**Pros:** the canonical implementation; MIT; broad language coverage.
**Cons:** slow; high memory; segment-level timestamps only, which fails the provenance requirement.

### Option B — faster-whisper (CTranslate2) *(chosen for transcription)*

**Pros:** roughly 4× faster, substantially lower memory, supports int8 quantisation so it runs
acceptably on CPU-only hardware — which matters enormously for the single-node profile. Same model
weights, so quality is equivalent.
**Cons:** still segment-level timestamps alone; another layer between us and upstream Whisper.

### Option C — WhisperX *(chosen for alignment and diarisation)*

**Pros:** forced alignment gives word-level timestamps; integrates pyannote diarisation; solves
exactly our provenance-precision problem.
**Cons:** heavier pipeline; pyannote models have gated licences requiring acceptance of terms, which
complicates the air-gapped offline bundle and must be handled explicitly in the install process.

### Option D — whisper.cpp

**Pros:** minimal dependencies, excellent CPU performance, trivially embeddable, no Python runtime.
**Cons:** weaker diarisation and alignment ecosystem.
**Retained** as the recommended binding for the most constrained and embedded deployments.

### Option E — Commercial ASR (Deepgram, AssemblyAI, Azure Speech)

**Pros:** often better accuracy, especially on hard audio; no infrastructure.
**Cons:** violates P1 as a default. Supported as opt-in adapters under the same egress policy as
ADR-0009, never as the default.

## Consequences

### Positive

- Word-level timestamps make provenance precise enough to play the exact sentence.
- Runs fully locally, including air-gapped.
- Quantisation makes CPU-only deployment viable, if slow.
- Engine choice is per-deployment configuration — an institution with better options for its
  language can use them.

### Negative

- A multi-stage pipeline is more failure modes than a single call. Each stage needs independent retry
  and observability.
- **pyannote's gated model licence** is a genuine friction point for offline bundles and must be
  documented in the install path rather than discovered by an operator at 2am.
- CPU-only transcription is 6–10× slower than realtime. A one-hour meeting takes 6–10 hours. This is
  documented plainly in the deployment guide, because discovering it in production would be a
  legitimate grievance.
- Diarisation error rate is meaningfully worse with crosstalk and overlapping speech, which is exactly
  what real meetings contain.

### Risks accepted

- **Quality in low-resource languages may be inadequate**, and this falls hardest on the institutions
  we most want to serve. Mitigations: publish WER and DER per language honestly; support
  community-contributed fine-tuned models; treat this as a named equity commitment with an owner
  rather than a known limitation nobody is accountable for.
- Diarisation errors propagate into attribution. Mitigated by making speaker mapping a separate
  human-confirmed step — a wrong label is correctable without re-transcribing, and attribution is
  never asserted on diarisation alone.

## Compliance and enforcement

- All transcription is behind `TranscriptionPort`; no engine-specific types leak into the domain.
- Every transcript records engine, engine version, model and parameters.
- Every utterance carries a start and end time in the media object — non-nullable.
- A benchmark suite runs against a held-out multilingual fixture set; WER and DER are published per
  language per release, including where results are poor.
- Speaker mapping is a distinct audited event, never inferred silently into the record.

## Reversal

`TranscriptionPort` makes engine substitution a configuration or adapter change — days, not weeks.
This is deliberately one of the cheapest reversals in the system, because ASR is the
fastest-moving part of our stack and we expect to change it more than once.

## References

- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) ·
  [WhisperX](https://github.com/m-bain/whisperX) ·
  [whisper.cpp](https://github.com/ggerganov/whisper.cpp) ·
  [pyannote.audio](https://github.com/pyannote/pyannote-audio)
