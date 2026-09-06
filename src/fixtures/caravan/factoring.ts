/**
 * Freight Factoring Underwriting Receipts Fixtures — fixture_only: true.
 *
 * Demonstrates the notary wedge for invoice factoring desks and commercial asset-backed
 * lenders. Payload OS provides the evidence-grade shipment receipt (fact + condition +
 * provenance + validation status + bitemporal basis) that factoring desks underwrite against.
 */
import type { FreightFactoringReceipt } from '@/domain/factoring';
import { computeReceiptDigest } from '@/domain/factoring';
import { digestOf } from '../digestLookup';

const MANIFEST_COMMITMENT = digestOf('release:caravan.specialty-cargo:2026.09.01');

// Raw Receipt 1 (Reefer Cargo — Clean Clearance)
const rawReceipt1 = {
  receiptId: 'RCP-FACT-2026-0901',
  shipmentId: 'SHP-CAR-88219',
  invoiceId: 'INV-44012',
  invoiceAmountCents: 425000, // $4,250.00
  carrier: {
    usdot: '80806',
    mc: 'MC-149021',
    legalName: 'NORTHERN CONTINENTAL TRANSPORT LLC',
    dotOperatingStatus: 'ACTIVE' as const,
    assignedEquipmentVin: '1FT8W3BT9NEC19283',
    assignedTrailerNumber: 'TR-5099-R',
    telematicsImei: '864209041289123',
  },
  broker: {
    brokerId: 'BRK-7710',
    legalName: 'APEX LOGISTICS FREIGHT SERVICES INC',
    mcNumber: 'MC-992014',
    creditTier: 'TIER_A_PRIME' as const,
  },
  origin: {
    name: 'Yakima Valley Cold Storage Terminal 4',
    city: 'Yakima',
    state: 'WA',
    latitude: 46.6021,
    longitude: -120.5059,
    geofenceRadiusMeters: 250,
  },
  destination: {
    name: 'Chicago Interstate Distribution Hub Bay 18',
    city: 'Bedford Park',
    state: 'IL',
    latitude: 41.7645,
    longitude: -87.7981,
    geofenceRadiusMeters: 300,
  },
  delivery: {
    pickupTimestamp: '2026-08-28T08:15:00Z',
    deliveryTimestamp: '2026-08-31T14:40:00Z',
    podType: 'CLEAN_SIGNED_PHYSICAL' as const,
    signatoryName: 'Marcus Vance',
    signatoryTitle: 'Receiving Dock Lead',
    podContentDigest: 'sha256:d8a7c2b5e91f0438a2e1d7a9f8b4c3e2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6',
    rateConContentDigest: 'sha256:4f8e2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f',
    bolNumber: 'BOL-YAK-2026-0881',
    telematicsGeofenceWitnessed: true,
  },
  physicalIntegrity: {
    scaleGrossLbs: 78420,
    scaleTareLbs: 34100,
    netDeliveredLbs: 44320,
    declaredWeightLbs: 44250,
    weightVariancePercent: 0.16, // within 0.5% tolerance
    temperatureCompliance: {
      requiredMinC: 1.0,
      requiredMaxC: 4.0,
      loggedMinC: 1.4,
      loggedMaxC: 3.7,
      maxExcursionMinutes: 0,
      status: 'COMPLIANT' as const,
    },
    sealVerification: {
      departSeal: 'SEAL-WA-9921',
      arriveSeal: 'SEAL-WA-9921',
      match: true,
    },
  },
  invariants: [
    {
      invariantId: 'FACT-INV-001',
      title: 'Consignee Execution & POD Authenticity',
      status: 'PASSED' as const,
      summary: 'Legible physical signature by designated receiving dock lead with verified consignee geofence witness.',
      evidenceRef: 'pod:sha256:d8a7c2b5',
    },
    {
      invariantId: 'FACT-INV-002',
      title: 'Carrier Operating Authority at Dispatch',
      status: 'PASSED' as const,
      summary: 'Carrier USDOT 80806 held active common carrier authority and active BMC-91X filings on MCMIS.',
    },
    {
      invariantId: 'FACT-INV-003',
      title: 'Double-Brokering Telematics Equipment Match',
      status: 'PASSED' as const,
      summary: 'Telematics ping sequence originated from carrier registered tractor VIN 1FT8W3BT9NEC19283; no unauthorized re-brokering.',
    },
    {
      invariantId: 'FACT-INV-004',
      title: 'Cold-Chain Environmental Integrity',
      status: 'PASSED' as const,
      summary: 'Continuous 15-minute reefer sensor log maintained between 1.4°C and 3.7°C (band: 1.0°C–4.0°C). Zero excursion.',
    },
    {
      invariantId: 'FACT-INV-005',
      title: 'Rate Confirmation & Bill of Lading Cross-Binding',
      status: 'PASSED' as const,
      summary: 'Rate confirmation line item matches invoice total ($4,250.00); no unapproved accessorials.',
    },
  ],
  verdict: {
    status: 'CLEARED_FOR_ADVANCE' as const,
    maxAdvanceBasisPoints: 9700, // 97.0%
    recommendedAdvanceCents: 412250, // $4,122.50
    escrowHoldCents: 12750, // $127.50 reserve (3.0%)
    riskRationale: 'All critical underwriting invariants satisfied. Clean signed POD, compliant reefer logs, and continuous telematics validation.',
  },
  notary: {
    notaryEngine: 'Payload OS Notary Attestation Service v1.2',
    corpusReleaseId: 'REL-CAR-2026.09.01',
    validAt: '2026-08-31T14:40:00Z',
    knownAt: '2026-09-01T12:00:00Z',
    manifestCommitment: MANIFEST_COMMITMENT,
    attestationStatement:
      'Payload OS attests that as of knowledge cutoff 2026-09-01T12:00:00Z, delivery facts and carrier qualification invariants were verified against corpus release REL-CAR-2026.09.01 without modification.',
  },
};

// Raw Receipt 2 (Double-Brokering / Re-brokering Fraud Detected)
const rawReceipt2 = {
  receiptId: 'RCP-FACT-2026-0902',
  shipmentId: 'SHP-CAR-91044',
  invoiceId: 'INV-88912',
  invoiceAmountCents: 580000, // $5,800.00
  carrier: {
    usdot: '3199812',
    mc: 'MC-771249',
    legalName: 'SWIFT FALCON FREIGHT SERVICES CORP',
    dotOperatingStatus: 'ACTIVE' as const,
    assignedEquipmentVin: '2WK4D78X19M019284',
    assignedTrailerNumber: '53-VAN-901',
    telematicsImei: '359120049182391',
  },
  broker: {
    brokerId: 'BRK-6012',
    legalName: 'SUMMIT EXPEDITE LOGISTICS LLC',
    mcNumber: 'MC-441829',
    creditTier: 'TIER_B_STANDARD' as const,
  },
  origin: {
    name: 'Allentown Beverage Bottling Plant',
    city: 'Allentown',
    state: 'PA',
    latitude: 40.6084,
    longitude: -75.4902,
    geofenceRadiusMeters: 200,
  },
  destination: {
    name: 'Atlanta Regional Distribution Depot',
    city: 'Forest Park',
    state: 'GA',
    latitude: 33.6212,
    longitude: -84.3688,
    geofenceRadiusMeters: 350,
  },
  delivery: {
    pickupTimestamp: '2026-08-29T10:00:00Z',
    deliveryTimestamp: '2026-08-31T09:15:00Z',
    podType: 'CARRIER_PORTAL_UNVERIFIED' as const,
    signatoryName: 'Unverified Scan',
    signatoryTitle: 'Unknown',
    podContentDigest: 'sha256:11a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2',
    rateConContentDigest: 'sha256:99a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8',
    bolNumber: 'BOL-AT-9018',
    telematicsGeofenceWitnessed: false,
  },
  physicalIntegrity: {
    scaleGrossLbs: 0,
    scaleTareLbs: 0,
    netDeliveredLbs: 0,
    declaredWeightLbs: 42000,
    weightVariancePercent: 0,
    temperatureCompliance: {
      requiredMinC: 0,
      requiredMaxC: 0,
      loggedMinC: 0,
      loggedMaxC: 0,
      maxExcursionMinutes: 0,
      status: 'NOT_APPLICABLE' as const,
    },
    sealVerification: {
      departSeal: 'UNKNOWN',
      arriveSeal: 'UNKNOWN',
      match: false,
    },
  },
  invariants: [
    {
      invariantId: 'FACT-INV-001',
      title: 'Consignee Execution & POD Authenticity',
      status: 'FAILED' as const,
      summary: 'Uploaded POD is an altered low-resolution scan; consignee signature name is blank and unconfirmed by facility receiver.',
    },
    {
      invariantId: 'FACT-INV-002',
      title: 'Carrier Operating Authority at Dispatch',
      status: 'PASSED' as const,
      summary: 'Entity USDOT 3199812 has active authority on SAFER.',
    },
    {
      invariantId: 'FACT-INV-003',
      title: 'Double-Brokering Telematics Equipment Match',
      status: 'FAILED' as const,
      summary:
        'CRITICAL FRAUD ALERT: Portal upload originated from offshore IP range (non-domestic VPN). Physical tractor telematics shows tractor was in Dallas, TX during the PA->GA haul. Suspected unauthorized load re-brokering.',
    },
    {
      invariantId: 'FACT-INV-005',
      title: 'Rate Confirmation & Bill of Lading Cross-Binding',
      status: 'WARNING' as const,
      summary: 'Discrepancy: Rate confirmation issued to SWIFT FALCON but physical BOL lists unassociated third carrier (Pinnacle Express).',
    },
  ],
  verdict: {
    status: 'REJECTED_SUSPECTED_FRAUD' as const,
    maxAdvanceBasisPoints: 0,
    recommendedAdvanceCents: 0,
    escrowHoldCents: 580000,
    riskRationale:
      'REJECT ADVANCE. High probability unauthorized re-brokering scheme. Equipment telematics coordinates contradict transit lane and portal submission originated from anonymized offshore IP.',
  },
  notary: {
    notaryEngine: 'Payload OS Notary Attestation Service v1.2',
    corpusReleaseId: 'REL-CAR-2026.09.01',
    validAt: '2026-08-31T09:15:00Z',
    knownAt: '2026-09-01T12:00:00Z',
    manifestCommitment: MANIFEST_COMMITMENT,
    attestationStatement:
      'Payload OS certifies that as of knowledge cutoff 2026-09-01T12:00:00Z, invariant evaluation detected irreconcilable equipment and telematics fraud signatures.',
  },
};

// Raw Receipt 3 (Temperature Excursion — Advance With Reserve Hold)
const rawReceipt3 = {
  receiptId: 'RCP-FACT-2026-0903',
  shipmentId: 'SHP-CAR-77402',
  invoiceId: 'INV-19042',
  invoiceAmountCents: 620000, // $6,200.00
  carrier: {
    usdot: '1849102',
    mc: 'MC-501928',
    legalName: 'CASCADE LOGISTICS CARRIERS LLC',
    dotOperatingStatus: 'ACTIVE' as const,
    assignedEquipmentVin: '3AKJHHDR9LS109281',
    assignedTrailerNumber: 'R-7720',
    telematicsImei: '864209049921820',
  },
  broker: {
    brokerId: 'BRK-7710',
    legalName: 'APEX LOGISTICS FREIGHT SERVICES INC',
    mcNumber: 'MC-992014',
    creditTier: 'TIER_A_PRIME' as const,
  },
  origin: {
    name: 'Fresno Fresh Produce Packing Facility',
    city: 'Fresno',
    state: 'CA',
    latitude: 36.7468,
    longitude: -119.7726,
    geofenceRadiusMeters: 200,
  },
  destination: {
    name: 'Denver Central Grocery Wholesale Terminal',
    city: 'Denver',
    state: 'CO',
    latitude: 39.7392,
    longitude: -104.9903,
    geofenceRadiusMeters: 250,
  },
  delivery: {
    pickupTimestamp: '2026-08-27T16:00:00Z',
    deliveryTimestamp: '2026-08-30T11:20:00Z',
    podType: 'CLEAN_SIGNED_PHYSICAL' as const,
    signatoryName: 'Elena Rostova',
    signatoryTitle: 'Produce QA Inspector',
    podContentDigest: 'sha256:77b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8',
    rateConContentDigest: 'sha256:33c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4',
    bolNumber: 'BOL-FRE-4421',
    telematicsGeofenceWitnessed: true,
  },
  physicalIntegrity: {
    scaleGrossLbs: 76500,
    scaleTareLbs: 33800,
    netDeliveredLbs: 42700,
    declaredWeightLbs: 42500,
    weightVariancePercent: 0.47,
    temperatureCompliance: {
      requiredMinC: 0.0,
      requiredMaxC: 3.5,
      loggedMinC: 1.2,
      loggedMaxC: 8.4,
      maxExcursionMinutes: 85,
      status: 'EXCURSION_RECORDED' as const,
    },
    sealVerification: {
      departSeal: 'CAL-SEAL-8012',
      arriveSeal: 'CAL-SEAL-8012',
      match: true,
    },
  },
  invariants: [
    {
      invariantId: 'FACT-INV-001',
      title: 'Consignee Execution & POD Authenticity',
      status: 'PASSED' as const,
      summary: 'Signed physical POD with QA produce exception note: "Delivered intact, temp recorder noted 85-min excursion over Utah pass."',
    },
    {
      invariantId: 'FACT-INV-002',
      title: 'Carrier Operating Authority at Dispatch',
      status: 'PASSED' as const,
      summary: 'Carrier USDOT 1849102 active on SAFER; valid auto and cargo insurance coverage verified.',
    },
    {
      invariantId: 'FACT-INV-003',
      title: 'Double-Brokering Telematics Equipment Match',
      status: 'PASSED' as const,
      summary: 'Verified tractor VIN matches geofenced physical transit corridor.',
    },
    {
      invariantId: 'FACT-INV-004',
      title: 'Cold-Chain Environmental Integrity',
      status: 'WARNING' as const,
      summary:
        'Temperature excursion flagged: ambient trailer sensor recorded 8.4°C for 85 cumulative minutes during defrost/climb cycle (required ceiling: 3.5°C). Potential cargo claim exposure.',
    },
  ],
  verdict: {
    status: 'ADVANCE_WITH_RESERVE' as const,
    maxAdvanceBasisPoints: 7000, // 70.0% advance cap
    recommendedAdvanceCents: 434000, // $4,340.00
    escrowHoldCents: 186000, // $1,860.00 hold against potential produce spoilage claim
    riskRationale:
      'Advance approved at reduced 70.0% rate with $1,860.00 escrow reserve pending final QA produce spoilage inspection and claim waiver.',
  },
  notary: {
    notaryEngine: 'Payload OS Notary Attestation Service v1.2',
    corpusReleaseId: 'REL-CAR-2026.09.01',
    validAt: '2026-08-30T11:20:00Z',
    knownAt: '2026-09-01T12:00:00Z',
    manifestCommitment: MANIFEST_COMMITMENT,
    attestationStatement:
      'Payload OS certifies that as of knowledge cutoff 2026-09-01T12:00:00Z, delivery occurred with a recorded cold-chain variance of 85 minutes exceeding 3.5°C.',
  },
};

export const FIXTURE_FACTORING_RECEIPTS: readonly FreightFactoringReceipt[] = [
  {
    ...rawReceipt1,
    notary: {
      ...rawReceipt1.notary,
      receiptDigest: computeReceiptDigest(rawReceipt1),
    },
  },
  {
    ...rawReceipt2,
    notary: {
      ...rawReceipt2.notary,
      receiptDigest: computeReceiptDigest(rawReceipt2),
    },
  },
  {
    ...rawReceipt3,
    notary: {
      ...rawReceipt3.notary,
      receiptDigest: computeReceiptDigest(rawReceipt3),
    },
  },
];
