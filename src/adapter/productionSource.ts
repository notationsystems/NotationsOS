/**
 * Read side of the candidate-production rail for the screens. The only
 * implementation returns the committed demonstration, which
 * src/fixtures/production/demo.contract.test.ts reproduces through the real
 * rails. A local implementation would reinspect .payload/evidence through
 * the same stores; it is not here, and this module says so.
 */
import demo from '@/fixtures/production/demo.json';
import type { ProductionDemo } from '@/domain/production';

export interface ProductionSource {
  origin: { kind: 'FIXTURE'; label: string };
  demo(): Promise<ProductionDemo>;
}

export function getProductionSource(): ProductionSource {
  return {
    origin: { kind: 'FIXTURE', label: 'Committed demonstration, reproduced through the local rails from examples/ at the stated instants' },
    async demo() { return demo as unknown as ProductionDemo; },
  };
}
