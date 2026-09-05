import type { Domain } from './types';

/**
 * The product architecture:
 *
 *   Notation Systems
 *   └─ Payload OS — shared information-production system
 *      ├─ Caravan — logistics, freight, cargo, supply-chain movement
 *      ├─ Tradewind — markets, instruments, pricing, risk
 *      └─ Landshark — parcels, zoning, entitlements, development state
 *
 * Payload OS is the shared production layer, not a fourth customer API.
 * Caravan is the only domain product with a corpus and fixtures in this
 * repository; Tradewind and Landshark are disabled module slots.
 */
export const PRODUCT_ROOT = { company: 'Notation Systems', platform: 'Payload OS', platformRole: 'Shared information-production system' } as const;

export const DOMAINS: ReadonlyArray<{ id: Domain; label: string; scope: string; enabled: boolean; note?: string }> = [
  { id: 'CARAVAN', label: 'Caravan', scope: 'Logistics, freight, cargo, supply-chain movement', enabled: true, note: 'Demonstration corpus and workbench in this repository.' },
  { id: 'TRADEWIND', label: 'Tradewind', scope: 'Markets, instruments, pricing, risk', enabled: false, note: 'Module slot. No corpus or profile in this repository.' },
  { id: 'LANDSHARK', label: 'Landshark', scope: 'Parcels, zoning, entitlements, development state', enabled: false, note: 'Module slot. No corpus or profile in this repository.' },
];
