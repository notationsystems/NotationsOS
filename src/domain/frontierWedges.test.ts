import { describe, expect, it } from 'vitest';
import {
  FIXTURE_DISCLOSURE_PACKS,
  FIXTURE_INSURABILITY_EVENTS,
  FIXTURE_CAPEX_PROGRESS,
} from '@/fixtures/frontier/anchors';

describe('Frontier Wedges: Anchor Products 1–3', () => {
  it('enforces Disclosure Assurance Pack boundary and audit readiness', () => {
    expect(FIXTURE_DISCLOSURE_PACKS.length).toBeGreaterThan(0);
    for (const pack of FIXTURE_DISCLOSURE_PACKS) {
      expect(pack.auditReadiness.targetAuditorTier).toBe('BIG_4_INDEPENDENT_ASSURANCE');
      expect(pack.auditReadiness.substrateStatus).toBe('ASSURANCE_READY_SUBSTRATE');
      expect(pack.systemBoundary.scope).toBe('CRADLE_TO_GATE');
      expect(pack.metrics.specificIntensityPerTonProduct).toBeGreaterThan(0);
      expect(pack.evidenceSubstrate.primaryMeterLogDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it('enforces Insurability Change Feed event structure and exposure tracking', () => {
    expect(FIXTURE_INSURABILITY_EVENTS.length).toBeGreaterThan(0);
    for (const evt of FIXTURE_INSURABILITY_EVENTS) {
      expect(evt.stateDoiCode).toBeDefined();
      expect(evt.impactAssessment.estimatedParcelsExposed).toBeGreaterThan(0);
      expect(evt.impactAssessment.leadTimeDaysToCollateralRepricing).toBeGreaterThan(0);
      expect(evt.filingArtifactDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it('enforces Capex Progress Verification and N11 Measurement Economics', () => {
    expect(FIXTURE_CAPEX_PROGRESS.length).toBeGreaterThan(0);
    for (const cpx of FIXTURE_CAPEX_PROGRESS) {
      expect(cpx.measurementEconomics.netMeasurementSurplusCents).toBeGreaterThan(0);
      expect(cpx.drawRequest.requestedDrawCents).toBeGreaterThan(0);
      expect(cpx.stateFinding.liabilityNotice).toContain('Verified physical state only');
      expect(cpx.stateFinding.rawSensorArtifactDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });
});
