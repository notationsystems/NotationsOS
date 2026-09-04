import type { Metadata } from 'next';
import { getCaseSource } from '@/adapter/caseSource';
import { buildResultManifest } from '@/fixtures/manifest';
import { FixtureBanner } from '@/components/primitives/FixtureBanner';
import { Section } from '@/components/primitives/Section';
import { CopyButton } from '@/components/primitives/CopyButton';

export const metadata: Metadata = { title: 'API' };

const CASE_SOURCE_CONTRACT = `interface CaseSource {
  origin: { kind: 'FIXTURE' | 'LIVE'; label: string };
  listCases(): Promise<ClaimCaseBundle[]>;
  getCase(caseId): Promise<ClaimCaseBundle | undefined>;
  getRuling(rulingId): Promise<{ bundle; ruling } | undefined>;
  listProfiles(): Promise<AdmissionProfile[]>;
  getProfile(profileId): Promise<AdmissionProfile | undefined>;
  getRemediation(remediationId): Promise<Remediation | undefined>;
}`;

export default async function ApiPage() {
  const source = getCaseSource();
  const hit = await source.getRuling('RUL-7C104-r2');
  const manifest = hit ? JSON.stringify(buildResultManifest(hit.bundle, hit.ruling), null, 2) : '';
  return (
    <>
      {source.origin.kind === 'FIXTURE' && <FixtureBanner note={source.origin.label} />}
      <div className="p-3 sm:p-5 max-w-[1000px] mx-auto w-full flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="m-0 text-[18px] font-semibold" style={{ color: 'var(--text-heading)' }}>Distribution-workbench adapter boundary</h1>
          <p className="m-0 text-[13px]" style={{ color: 'var(--text-secondary)' }}>This repository serves no distribution endpoint. Screens read through one adapter interface; the only implementation is the fixture source. A live adapter maps release-bound Payload OS responses to the workbench view model and does not create another corpus, policy, or verification system.</p>
        </header>

        <Section title="Authority boundary" id="api-authority">
          <ul className="m-0 pl-4 text-[13px] flex flex-col gap-1" style={{ color: 'var(--text-primary)' }}>
            <li>The browser renders fixture inspection views; it does not compute canonical corpus state, apply customer inference, or issue a customer decision. No second gate battery or inference from display fields.</li>
            <li>Presentation validation only: projections by visibility class, by knowledge time, and highlight linking from a failed check to its claims, evidence and remediation.</li>
            <li>Every action in the interface produces an action intent that a live adapter would send. Nothing is sent here.</li>
          </ul>
        </Section>

        <Section title="Adapter contract" id="api-contract" aside={<CopyButton value={CASE_SOURCE_CONTRACT} />}>
          <pre tabIndex={0} className="m-0 surface-inset p-3 overflow-x-auto text-[11.5px] mono" style={{ color: 'var(--text-secondary)' }}>{CASE_SOURCE_CONTRACT}</pre>
          <p className="m-0 text-[12px]" style={{ color: 'var(--text-muted)' }}>Source: src/adapter/caseSource.ts. View model: src/domain/types.ts.</p>
        </Section>

        <Section title="Substrate vocabulary carried by the view model" id="api-vocab">
          <table className="ledger-table text-[12.5px]">
            <thead><tr><th scope="col">Concept</th><th scope="col">Substrate origin</th><th scope="col">View model field</th></tr></thead>
            <tbody>
              <tr><td>Evidence class, two axes + interest</td><td className="id">corpus-contract/contract.json 1.0.0</td><td className="id">EvidenceClass.claimStrength / productionClass / interest</td></tr>
              <tr><td>Canonical identity</td><td className="id">control-plane/src/identity/canonical-uri.js</td><td className="id">notation://&lt;kind&gt;/&lt;authority&gt;/&lt;local-id&gt;</td></tr>
              <tr><td>Result manifest</td><td className="id">control-plane/src/governance/result-manifest.js</td><td className="id">buildResultManifest() → notations.result-manifest.v1</td></tr>
              <tr><td>Manifest verification status</td><td className="id">verified | partially_verified | unverified | challenged</td><td className="id">AssuranceStatus.manifestVerification</td></tr>
              <tr><td>Anchor kind, proof system</td><td className="id">payload-terminal/src/lib/economy/notary.types.ts</td><td className="id">AssuranceStatus.anchor / proofSystem</td></tr>
              <tr><td>Capability maturity</td><td className="id">control-plane/src/governance/maturity.js</td><td className="id">InvariantDefinition.implementation</td></tr>
              <tr><td>knownAt distinct from valid time</td><td className="id">payload-methodology.js temporalSemantics</td><td className="id">TemporalBasis.validAt / knownAt</td></tr>
              <tr><td>Refusal with remedy</td><td className="id">decisionEpisode.ts AlternativeFeasibility</td><td className="id">InvariantResult.refusalCode + Remediation.instruction</td></tr>
            </tbody>
          </table>
        </Section>

        <Section title="Example result manifest (RUL-7C104-r2)" id="api-manifest" aside={<CopyButton value={manifest} label="Copy JSON" />}>
          <pre tabIndex={0} className="m-0 surface-inset p-3 overflow-x-auto text-[11.5px] mono" style={{ color: 'var(--text-secondary)', maxHeight: 480 }}>{manifest}</pre>
        </Section>
      </div>
    </>
  );
}
