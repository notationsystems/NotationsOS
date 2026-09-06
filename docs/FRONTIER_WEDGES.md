# Frontier Wedges & Strategic Expansion Architecture

Authoritative specification for expanding Payload OS along the eight frontier passages, observing the core productization gate:

> **The Invariant Rule:** Sell the substrate, leave liability, capital, and network positions to others.
> The evidence, not the liability; the scheduling, not the sensors; the index, not the trigger; the compute, not the platform; the corpus, not the coalition.

---

## 1. Commercial Sequencing

We anchor customer traction on **Passages 1–3**, where immediate non-discretionary budget exists from financing, assurance, and specialty insurance:

1. **Disclosure-Assurance Economy (CBAM, CSRD, UFLPA, EUDR)**: Sells evidence packs to Big 4 verifiers.
2. **Insurability Dynamics**: Sells state DOI withdrawal & coverage gap feeds to lenders, brokers, and municipalities.
3. **Capex Progress Verification**: Sells verified physical progress states via N11 measurement economics to project finance lenders.

Passages 4–8 mature off the estate as daily captures run continuously.

---

## 2. The Eight Frontier Passages

| Frontier Passage | Primary Buyer | Sells (Surviving Wedge) | Must Not Become (The Trap) | Why the Trap is Fatal |
| :--- | :--- | :--- | :--- | :--- |
| **1. Disclosure Assurance** | Big 4 & ESG Auditors | Raw evidence packs & emissions substrate | Registry of record / standards body | Big 4 hold client relationship and audit liability; registries are politicized standards bodies. |
| **2. Insurability Dynamics** | Lenders, Brokers, Municipalities | State DOI withdrawal & coverage gap feeds | Carrier / actuarial risk shop | Actuarial arms race against incumbents with infinite balance sheets; state DOI filings are an archive-gated estate. |
| **3. Progress Verification** | Project Finance Lenders | Verified progress states + N11 VOI | Certifying engineer of record | Professional liability & stamp indemnification; banks want objective physical states to unlock draw approvals. |
| **4. Measurement Economy** | Insurers & Financiers | VOI inspection scheduling subscription | Sensor owner or services marketplace | Operational capex, pilot turnover, equipment depreciation, and broker margin collapse. |
| **5. Parametric Triggers** | ILS & Parametric Covers | Attested event ledger trigger index | Settlement oracle / escrow payer | Absorbing basis-risk disputes and payout execution exposure; index providers take fees without payout risk. |
| **6. Clean-Room Compute** | Competing Lenders & Brokers | Multi-party zero-knowledge clean rooms | General-purpose analytics platform | Snowflake and Databricks win general cloud compute; our moat is that the corpus never leaves the room. |
| **7. Disagreement Signals** | Internal Proprietary Capital | Internal signals from multi-source gaps | Public product feature / early trade | Leaking priority cues to vendors, or trading before held-out models establish non-extraction error. |
| **8. Sovereign Illumination** | Government Agencies | Gated procurement vertical over corpus | Government-contractor identity | Bureaucracy, clearance overhead, and foreign-market regulatory disqualification. |

---

## 3. Implemented Endpoints & Schemas

- **Disclosure Assurance:**
  - Contract: `src/domain/frontierWedges.ts` (`DisclosureAssurancePack`)
  - Endpoint: `GET /api/v1/frontier/assurance`
  - Workbench: `/frontier` (Tab: 1. Disclosure Assurance)
- **Insurability Dynamics:**
  - Contract: `src/domain/frontierWedges.ts` (`InsurabilityChangeFeedEvent`)
  - Endpoint: `GET /api/v1/frontier/insurability`
  - Workbench: `/frontier` (Tab: 2. Insurability Dynamics)
- **Capex Progress Verification:**
  - Contract: `src/domain/frontierWedges.ts` (`CapexProgressVerification`)
  - Endpoint: `GET /api/v1/frontier/capex-progress`
  - Workbench: `/frontier` (Tab: 3. Capex Progress)
