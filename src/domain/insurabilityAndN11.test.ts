import { describe, expect, it } from 'vitest';
import { evaluatePortfolioCollateralShock } from './insurabilityDynamics';
import { optimizeInspectionTasking, MEASUREMENT_INSTRUMENTS } from './n11MeasurementEconomy';
import {
  FIXTURE_STATE_DOI_FILINGS,
  FIXTURE_LOAN_PORTFOLIO,
  FIXTURE_PROJECT_DRAWS,
} from '@/fixtures/frontier/insurabilityAndN11';

describe('Track 3: Insurability Dynamics & Collateral Repricing', () => {
  it('correctly evaluates loan collateral shock under carrier withdrawal and moratoria', () => {
    const result = evaluatePortfolioCollateralShock(FIXTURE_LOAN_PORTFOLIO, FIXTURE_STATE_DOI_FILINGS);

    expect(result.portfolioSummary.totalLoansEvaluated).toBe(FIXTURE_LOAN_PORTFOLIO.length);
    expect(result.portfolioSummary.loansDirectlyImpacted).toBeGreaterThan(0);
    expect(result.portfolioSummary.collateralBalanceExposedCents).toBeGreaterThan(0);
    expect(result.portfolioSummary.pctPortfolioExposed).toBeGreaterThan(0);

    // Sierra Foothills Logistics Park in Placer County (Pacific Horizon withdrawing)
    const sierraLoanImpact = result.loanImpacts.find((i) => i.loanId === 'LN-CRE-CA-001');
    expect(sierraLoanImpact).toBeDefined();
    expect(sierraLoanImpact?.status).toBe('CARRIER_WITHDRAWING');
    expect(sierraLoanImpact?.financialShock.premiumIncreaseRatio).toBe(3.8);
    expect(sierraLoanImpact?.financialShock.stressedDscr).toBeLessThan(sierraLoanImpact!.financialShock.baselineDscr);
    expect(sierraLoanImpact?.estimatedLeadTimeToRepricingDays).toBeGreaterThan(0);

    // Tampa Bay Waterfront in Pinellas County (Moratorium declared)
    const tampaLoanImpact = result.loanImpacts.find((i) => i.loanId === 'LN-CRE-FL-002');
    expect(tampaLoanImpact).toBeDefined();
    expect(tampaLoanImpact?.status).toBe('CORRIDOR_CAPACITY_SHRINK');
    expect(tampaLoanImpact?.financialShock.dscrBreach).toBe(true); // Stressed DSCR drops below covenant threshold
  });
});

describe('Track 4: N11 Value of Information (VOI) Tasking Optimizer', () => {
  it('loads instrument profiles with valid Bayesian sensitivity parameters', () => {
    expect(MEASUREMENT_INSTRUMENTS.length).toBeGreaterThanOrEqual(5);
    for (const inst of MEASUREMENT_INSTRUMENTS) {
      expect(inst.defectDetectionSensitivity).toBeGreaterThan(0.7);
      expect(inst.falseAlarmRate).toBeLessThan(0.25);
      expect(inst.latencyHours).toBeGreaterThan(0);
    }
  });

  it('computes positive net measurement surplus and selects Pareto-optimal instrument', () => {
    const drawContext = FIXTURE_PROJECT_DRAWS[0]; // Potomac Gateway Hyperscale
    const schedule = optimizeInspectionTasking(drawContext);

    expect(schedule.evaluations.length).toBe(MEASUREMENT_INSTRUMENTS.length);
    expect(schedule.recommendedInstrument).toBeDefined();
    expect(schedule.recommendedInstrument.recommendationStatus).toBe('OPTIMAL_SELECTION');
    expect(schedule.recommendedInstrument.netMeasurementSurplusCents).toBeGreaterThan(0);
    expect(schedule.recommendedInstrument.returnOnMeasurementSpendRatio).toBeGreaterThan(1.0);

    // Verify draft tasking order
    expect(schedule.measurementOrderDraft.orderId).toMatch(/^N11-TASK-/);
    expect(schedule.measurementOrderDraft.budgetAuthorizedCents).toBe(schedule.recommendedInstrument.instrument.unitCostCents);
    expect(schedule.measurementOrderDraft.notaryNotice).toContain('Value of information optimization schedule only');
  });

  it('rejects instruments that exceed lender latency constraints', () => {
    const tightLatencyContext = {
      ...FIXTURE_PROJECT_DRAWS[0],
      maxAllowedLatencyHours: 15, // Only satellite or fast drone can meet this
    };
    const schedule = optimizeInspectionTasking(tightLatencyContext);

    const manualWalkthrough = schedule.evaluations.find((e) => e.instrument.id === 'MANUAL_ENGINEER_WALKTHROUGH');
    expect(manualWalkthrough?.recommendationStatus).toBe('LATENCY_EXCEEDED');
    expect(manualWalkthrough?.expectedValueOfInformationCents).toBe(0);
  });
});
