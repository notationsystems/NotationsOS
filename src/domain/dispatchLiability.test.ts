import { describe, expect, it } from 'vitest';
import { FIXTURE_DISPATCH_STREAM, DEFENSE_RECONSTRUCTION_CASE_0803 } from '@/fixtures/caravan/dispatchLiability';
import { verifyDispatchStreamIntegrity } from './dispatchLiability';

describe('Algorithmic Dispatch Liability & Streaming Attestation', () => {
  it('verifies SHA-256 chain continuity across the streaming dispatch events', () => {
    expect(FIXTURE_DISPATCH_STREAM.length).toBe(4);

    const verification = verifyDispatchStreamIntegrity(FIXTURE_DISPATCH_STREAM);
    expect(verification.intact).toBe(true);

    // Verify hash link between sequence 1 and sequence 2
    expect(FIXTURE_DISPATCH_STREAM[1].previousEventDigest).toBe(FIXTURE_DISPATCH_STREAM[0].eventDigest);
    expect(FIXTURE_DISPATCH_STREAM[2].previousEventDigest).toBe(FIXTURE_DISPATCH_STREAM[1].eventDigest);
    expect(FIXTURE_DISPATCH_STREAM[3].previousEventDigest).toBe(FIXTURE_DISPATCH_STREAM[2].eventDigest);
  });

  it('detects breaks or tampering anywhere in the event chain', () => {
    const tamperedStream = structuredClone(FIXTURE_DISPATCH_STREAM);
    // Tamper with carrier safety rating in event 1
    tamperedStream[1].carrierSafetySnapshot.safetyRating = 'CONDITIONAL';

    const verification = verifyDispatchStreamIntegrity(tamperedStream);
    expect(verification.intact).toBe(false);
    expect(verification.brokenIndex).toBe(1);
  });

  it('supports bitemporal defense reconstruction distinguishing Tk from Tsubpoena', () => {
    const recon = DEFENSE_RECONSTRUCTION_CASE_0803;

    expect(recon.stateAtTk.defensible).toBe(true);
    expect(recon.stateAtTk.safetyRating).toBe('SATISFACTORY');
    expect(recon.stateAtTk.fatalCrashes).toBe(0);

    // Later at subpoena time, the carrier had an accident and was downgraded
    expect(recon.stateAtTsub.safetyRating).toBe('CONDITIONAL');
    expect(recon.stateAtTsub.subsequentAccidentCount).toBe(1);

    expect(recon.evidentiaryFinding).toContain('At knowledge cutoff Tk (2026-08-28T14:15:00Z)');
  });
});
