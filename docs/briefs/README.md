# Build briefs

The briefs each build phase was implemented from (one focused agent per phase, verified afterwards by the coordinating
session). They record the requirements and product decisions of that phase; what was actually built, and the deviations,
are in `docs/modules/<module>.md`.

| Brief | Phase | Result doc |
| --- | --- | --- |
| `02-configuration.md` | Configuration module | `docs/modules/configuration.md` |
| `03-forms-jobs.md` | Form Builder, scheduled jobs, My work | `docs/modules/forms.md`, `docs/modules/jobs.md` |
| `04-incidents.md` | Incident module | `docs/modules/incidents.md` |
| `05-risk.md` | Risk module | `docs/modules/risk.md` |
| `06-document-surveys.md` | Document surveys | `docs/modules/document-surveys.md` |
| `07-law.md` | Law module (+ Risk / Incident integration) | `docs/modules/law.md` |
| `08-simplified-law.md` | Simplified law (the boss's storyboard, built next to Law) | `docs/modules/simplified-law.md` |

Phase 1 (multi-tenant platform foundation) is summarised in `docs/modules/platform.md`.
**Template for the next modules (Audit, Inspection):** copy the structure of `05-risk.md` or `07-law.md`.
