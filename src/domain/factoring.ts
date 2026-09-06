/**
 * Payload OS — Freight Factoring Underwriting Receipts.
 *
 * NOTARY, NOT SETTLER.
 * This module does not execute funds transmission, banking float, or UCC 4A settlement.
 * It provides evidence-grade shipment receipts (fact + condition + provenance + validation status)
 * for factoring desks and asset-backed financing firms to underwrite advances against.
 */
import { createHash } from 'node:crypto';
import type { Hash, ISODateTime } from './types';
import { canonicalJson } from '@/fixtures/digest';

export type PodVerificationType =
  | 'CLEAN_SIGNED_PHYSICAL'
  | 'EDI_214_ELECTRONIC'
  | 'GEOFENCE_TELEMATICS_WITNESSED'
  | 'CARRIER_PORTAL_UNVERIFIED';

export type FactoringUnderwritingStatus =
  | 'CLEARED_FOR_ADVANCE'
  | 'ADVANCE_WITH_RESERVE'
  | 'SUSPENDED_UNVERIFIED'
  | 'REJECTED_SUSPECTED_FRAUD';

export interface CarrierIdentity {
  usdot: string;
  mc: string;
  legalName: string;
  dotOperatingStatus: 'ACTIVE' | 'INACTIVE' | 'REVOKED';
  assignedEquipmentVin: string;
  assignedTrailerNumber: string;
  telematicsImei?: string;
}

export interface BrokerIdentity {
  brokerId: string;
  legalName: string;
  mcNumber: string;
  creditTier: 'TIER_A_PRIME' | 'TIER_B_STANDARD' | 'WATCHLIST';
}

export interface FacilityWaypoint {
  name: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
}

export interface DeliveryAttestation {
  pickupTimestamp: ISODateTime;
  deliveryTimestamp: ISODateTime;
  podType: PodVerificationType;
  signatoryName: string;
  signatoryTitle: string;
  podContentDigest: Hash;
  rateConContentDigest: Hash;
  bolNumber: string;
  telematicsGeofenceWitnessed: boolean;
}

export interface PhysicalIntegrityAudit {
  scaleGrossLbs: number;
  scaleTareLbs: number;
  netDeliveredLbs: number;
  declaredWeightLbs: number;
  weightVariancePercent: number;
  temperatureCompliance: {
    requiredMinC: number;
    requiredMaxC: number;
    loggedMinC: number;
    loggedMaxC: number;
    maxExcursionMinutes: number;
    status: 'COMPLIANT' | 'EXCURSION_RECORDED' | 'NOT_APPLICABLE';
  };
  sealVerification: {
    departSeal: string;
    arriveSeal: string;
    match: boolean;
  };
}

export interface FactoringInvariant {
  invariantId: string;
  title: string;
  status: 'PASSED' | 'WARNING' | 'FAILED';
  summary: string;
  evidenceRef?: string;
}

export interface FactoringUnderwritingVerdict {
  status: FactoringUnderwritingStatus;
  maxAdvanceBasisPoints: number; // e.g. 9700 = 97.0%
  recommendedAdvanceCents: number;
  escrowHoldCents: number;
  riskRationale: string;
}

export interface NotaryAttestation {
  notaryEngine: string;
  corpusReleaseId: string;
  validAt: ISODateTime;
  knownAt: ISODateTime; // Tk cutoff
  receiptDigest: Hash;
  manifestCommitment: Hash;
  attestationStatement: string;
}

export interface FreightFactoringReceipt {
  receiptId: string;
  shipmentId: string;
  invoiceId: string;
  invoiceAmountCents: number;
  carrier: CarrierIdentity;
  broker: BrokerIdentity;
  origin: FacilityWaypoint;
  destination: FacilityWaypoint;
  delivery: DeliveryAttestation;
  physicalIntegrity: PhysicalIntegrityAudit;
  invariants: FactoringInvariant[];
  verdict: FactoringUnderwritingVerdict;
  notary: NotaryAttestation;
}

/**
 * Deterministically computes the SHA-256 digest of a factoring receipt payload,
 * excluding the receiptDigest field itself.
 */
export function computeReceiptDigest(receipt: Omit<FreightFactoringReceipt, 'notary'> & { notary: Omit<NotaryAttestation, 'receiptDigest'> }): Hash {
  const normalized = {
    receiptId: receipt.receiptId,
    shipmentId: receipt.shipmentId,
    invoiceId: receipt.invoiceId,
    invoiceAmountCents: receipt.invoiceAmountCents,
    carrier: receipt.carrier,
    broker: receipt.broker,
    delivery: {
      podContentDigest: receipt.delivery.podContentDigest,
      rateConContentDigest: receipt.delivery.rateConContentDigest,
      bolNumber: receipt.delivery.bolNumber,
      deliveryTimestamp: receipt.delivery.deliveryTimestamp,
    },
    physicalIntegrity: receipt.physicalIntegrity,
    invariants: receipt.invariants.map((i) => ({ id: i.invariantId, status: i.status })),
    verdict: receipt.verdict,
    notaryScope: {
      corpusReleaseId: receipt.notary.corpusReleaseId,
      validAt: receipt.notary.validAt,
      knownAt: receipt.notary.knownAt,
      manifestCommitment: receipt.notary.manifestCommitment,
    },
  };

  return `sha256:${createHash('sha256').update(canonicalJson(normalized)).digest('hex')}`;
}

/**
 * Validates whether an underwriting receipt has an uncorrupted cryptographic attestation.
 */
export function verifyFactoringReceiptIntegrity(receipt: FreightFactoringReceipt): boolean {
  const computed = computeReceiptDigest(receipt);
  return computed === receipt.notary.receiptDigest;
}
