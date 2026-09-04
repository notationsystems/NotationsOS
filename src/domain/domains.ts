import type { Domain } from './types';

/**
 * The product family's three domain surfaces. Caravan is the only one with a
 * profile and fixtures in this repository; Tradewind and Landshark are
 * disabled module slots, not fabricated applications.
 */
export const DOMAINS: ReadonlyArray<{ id: Domain; label: string; scope: string; enabled: boolean }> = [
  { id: 'CARAVAN', label: 'Caravan', scope: 'Logistics, freight, maritime, custody, cargo and shipment transactions', enabled: true },
  { id: 'TRADEWIND', label: 'Tradewind', scope: 'Commodities, physical-economy claims, derivatives, public disclosures. Module slot — no profile in this repository.', enabled: false },
  { id: 'LANDSHARK', label: 'Landshark', scope: 'Parcels, zoning, surveying, development, leases, property. Module slot — no profile in this repository.', enabled: false },
];
