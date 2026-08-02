# Scripts

**Owner:** Developer Experience Lead
**Status:** Active

Repository automation. **All real CI logic lives here**, not in workflow YAML — so the pipeline is
portable off GitHub Actions, and so a contributor can run locally exactly what CI runs.

A public-infrastructure project that can only be built on one commercial platform is not credibly
sovereign, including when that platform is the one we currently use.

| Path | Contents |
|---|---|
| [`ci/`](ci/) | Governance and quality gates — links, doc headers, ADRs, CODEOWNERS coverage, branch divergence, bundle budget |
| [`dev/`](dev/) | Local development — prerequisites, stack health, data reset, ADR creation |
| [`release/`](release/) | Release preflight and packaging |
| [`security/`](security/) | **Zero-egress verification**, licence compatibility, secret and container scanning, SBOM, action pinning |

## Rules

- Every script runs identically locally and in CI.
- Fail with a **clear message**, not a stack trace. A contributor blocked on their first morning by
  an
  unhelpful error may not come back.
- Bash only where trivial. Anything with real logic goes to Node or Python.
- Exit non-zero on failure, and say what would fix it.
