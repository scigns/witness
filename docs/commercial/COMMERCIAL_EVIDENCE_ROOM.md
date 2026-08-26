# Commercial evidence room

**Owner:** Commercial Lead & Security Lead
**Status:** Future due-diligence structure
**Review:** Quarterly and before external diligence

The public repository documents what evidence should exist. Confidential evidence belongs in an
approved access-controlled repository with retention, classification and audit appropriate to the
organisation.

| Folder | Evidence examples |
|---|---|
| 01 Product | Overview, roadmap, pilot evidence, limitations |
| 02 Architecture | ADRs, system/data/deployment architecture |
| 03 Security | Threat model, reviews, scans, incidents, restore evidence |
| 04 Commercial | Packages, pricing hypotheses, contracts and revenue evidence |
| 05 Procurement | Vendor documents, questionnaires, POs and approvals |
| 06 Customer Evidence | Approved evaluations, references and case studies |
| 07 Company/IP | Entity, ownership and licensing evidence |
| 08 Financial Model | Revenue, cost, allocation and forecast assumptions |
| 09 Investor Materials | Approved board/investor artefacts |

## Classification

Use `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, or `CUSTOMER-CONFIDENTIAL`. Customer-confidential data,
executed agreements, bank details, credentials, personal data and non-public security findings must
never enter the public repository. Every artefact records owner, source, date, reviewer, expiry or
review date, and whether it is evidence of implementation or only a plan. Assign each evidence-room
record a stable record ID that resolves to those fields so controlled questionnaires and reviews can
cite it without duplicating confidential evidence.
