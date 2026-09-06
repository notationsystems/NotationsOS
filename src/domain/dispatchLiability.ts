/**
 * Payload OS — Algorithmic Dispatch Liability & Streamed Notary Archive.
 *
 * THE NOTARY WEDGE FOR 3PLs, BROKERS, AND CASUALTY INSURERS.
 *
 * In commercial transportation and autonomous transit, catastrophic liability
 * turns on the legal standard of care at the exact moment an automated dispatch
 * decision was executed: "What did the algorithmic system know at knowledge cutoff Tk?"
 *
 * Under doctrine such as negligent carrier selection (Miller v. C.H. Robinson),
 * subsequent downgrades or accidents cannot be retroactively imputed to the broker
 * if the selection was demonstrably prudent at Tk.
 *
 * This module implements a cryptographic event stream with rolling attestation windows,
 * proving the pre-existence and admissibility of carrier safety qualifications at decision time.
 */
import { createHash } from 'node:crypto';
import type { Hash, ISODateTime } from './types';
import { canonicalJson } from '@/fixtures/digest';

export type CarrierAuthorityState = 'ACTIVE_COMMON' | 'ACTIVE_CONTRACT' | 'INACTIVE' | 'REVOKED';
export type SafetyRatingStatus = 'SATISFACTORY' | 'UNRATED' | 'CONDITIONAL' | 'UNSATISFACTORY';
export type DoctrineComplianceLevel = 'DEFENSIBLE_SELECTION' | 'MARGINAL_CONDITIONAL' | 'HIGH_EXPOSURE_REJECTED';

export interface CarrierSafetySnapshotAtDecision {
  usdot: string;
  mc: string;
  legalName: string;
  dbaName?: string;
  operatingAuthorityStatus: CarrierAuthorityState;
  safetyRating: SafetyRatingStatus;
  vehicleOosRate: number; // e.g. 12.1
  nationalVehicleOosAvg: number; // e.g. 21.4
  driverOosRate: number; // e.g. 2.8
  nationalDriverOosAvg: number; // e.g. 5.8
  crashHistory24Mo: {
    fatal: number;
    injury: number;
    towaway: number;
  };
  insuranceFilingStatus: {
    bipdRequiredCents: number;
    bipdOnFileCents: number;
    cargoOnFileCents: number;
    insurer: string;
    policyEffectiveDate: string;
  };
  chameleonCarrierIndicators: {
    addressMatchesRevokedEntity: boolean;
    recentReincorporationDays: number | null;
    flagged: boolean;
  };
}

export interface RollingWindowAttestation {
  windowBlockId: string;
  windowStart: ISODateTime;
  windowEnd: ISODateTime;
  merkleBlockRoot: Hash;
  corpusReleaseId: string;
  manifestCommitment: Hash;
}

export interface AlgorithmicDispatchDecision {
  decisionId: string;
  sequenceIndex: number;
  previousEventDigest: Hash; // SHA-256 chain linking to previous dispatch event in stream
  eventDigest: Hash; // SHA-256 over this event's canonical representation
  decisionTimestamp: ISODateTime; // Physical occurrence time (validAt)
  knowledgeCutoff: ISODateTime; // Tk cutoff
  broker: {
    brokerId: string;
    name: string;
    algorithmPolicyId: string;
    algorithmVersion: string;
  };
  load: {
    loadId: string;
    origin: string;
    destination: string;
    requiredEquipment: string;
    commodity: string;
    hazmat: boolean;
    declaredValueCents: number;
  };
  carrierSafetySnapshot: CarrierSafetySnapshotAtDecision;
  qualificationVerdict: {
    selectionAllowed: boolean;
    doctrineCompliance: DoctrineComplianceLevel;
    safeHarborCriteriaMet: string[];
    riskScorePercentile: number; // 0 (best) to 100 (worst)
    legalSummary: string;
  };
  rollingAttestation: RollingWindowAttestation;
}

/**
 * Computes the cryptographic digest for a dispatch decision event in the stream.
 */
export function computeDispatchEventDigest(
  event: Omit<AlgorithmicDispatchDecision, 'eventDigest'>
): Hash {
  const normalized = {
    decisionId: event.decisionId,
    sequenceIndex: event.sequenceIndex,
    previousEventDigest: event.previousEventDigest,
    decisionTimestamp: event.decisionTimestamp,
    knowledgeCutoff: event.knowledgeCutoff,
    broker: event.broker,
    load: event.load,
    carrier: {
      usdot: event.carrierSafetySnapshot.usdot,
      mc: event.carrierSafetySnapshot.mc,
      authority: event.carrierSafetySnapshot.operatingAuthorityStatus,
      safetyRating: event.carrierSafetySnapshot.safetyRating,
      vehicleOos: event.carrierSafetySnapshot.vehicleOosRate,
      driverOos: event.carrierSafetySnapshot.driverOosRate,
      fatalCrashes: event.carrierSafetySnapshot.crashHistory24Mo.fatal,
      insuranceBipd: event.carrierSafetySnapshot.insuranceFilingStatus.bipdOnFileCents,
    },
    verdict: {
      selectionAllowed: event.qualificationVerdict.selectionAllowed,
      doctrineCompliance: event.qualificationVerdict.doctrineCompliance,
    },
    rollingWindow: {
      windowBlockId: event.rollingAttestation.windowBlockId,
      merkleBlockRoot: event.rollingAttestation.merkleBlockRoot,
      corpusReleaseId: event.rollingAttestation.corpusReleaseId,
    },
  };

  return `sha256:${createHash('sha256').update(canonicalJson(normalized)).digest('hex')}`;
}

/**
 * Verifies that a sequence of dispatch events maintains continuous SHA-256 chain integrity.
 */
export function verifyDispatchStreamIntegrity(stream: readonly AlgorithmicDispatchDecision[]): {
  intact: boolean;
  brokenIndex?: number;
  reason?: string;
} {
  for (let i = 0; i < stream.length; i++) {
    const event = stream[i];
    const computedDigest = computeDispatchEventDigest(event);

    if (computedDigest !== event.eventDigest) {
      return {
        intact: false,
        brokenIndex: i,
        reason: `Digest mismatch at index ${i} (${event.decisionId}): expected ${computedDigest}, got ${event.eventDigest}`,
      };
    }

    if (i > 0) {
      const prevEvent = stream[i - 1];
      if (event.previousEventDigest !== prevEvent.eventDigest) {
        return {
          intact: false,
          brokenIndex: i,
          reason: `Chain broken between index ${i - 1} and ${i}: previousEventDigest ${event.previousEventDigest} !== ${prevEvent.eventDigest}`,
        };
      }
    }
  }

  return { intact: true };
}

/**
 * Bitemporal comparison object for evidentiary defense reconstruction.
 */
export interface BitemporalDefenseReconstruction {
  decisionId: string;
  carrierUsdot: string;
  carrierName: string;
  decisionTimestamp: ISODateTime;
  knowledgeTimeTk: ISODateTime;
  subpoenaTimeTsub: ISODateTime;
  stateAtTk: {
    authority: CarrierAuthorityState;
    safetyRating: SafetyRatingStatus;
    vehicleOosRate: number;
    fatalCrashes: number;
    defensible: boolean;
  };
  stateAtTsub: {
    authority: CarrierAuthorityState;
    safetyRating: SafetyRatingStatus;
    vehicleOosRate: number;
    subsequentAccidentCount: number;
  };
  evidentiaryFinding: string;
}
