import type { Domain } from './types';

/**
 * The product family's three domain surfaces. Caravan is the only one with a
 * profile and fixtures in this repository; Tradewind and Landshark are
 * disabled module slots, not fabricated applications.
 */
export const DOMAINS: ReadonlyArray<{ id: Domain; label: string; scope: string; enabled: boolean }> = [
  { id: 'CARAVAN', label: 'Caravan', scope: 'Logistics, freight, cargo, and supply-chain movement', enabled: true },
  { id: 'TRADEWIND', label: 'Tradewind', scope: 'Markets, instruments, pricing, and risk. Module slot — no profile in this repository.', enabled: false },
  { id: 'LANDSHARK', label: 'Landshark', scope: 'Parcels, zoning, entitlements, and development state. Module slot — no profile in this repository.', enabled: false },
];
