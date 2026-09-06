import { NextResponse } from 'next/server';
import { getCalibratedInstruments } from '@/domain/n11MeasurementEconomy';
import { FIXTURE_TASKING_ORDERS } from '@/fixtures/frontier/productionCorpus';

export async function GET() {
  const instruments = getCalibratedInstruments(FIXTURE_TASKING_ORDERS);

  return NextResponse.json({
    schema: 'payload.frontier.measurement-economy.instruments.v1',
    count: instruments.length,
    doctrine: {
      role: 'MEASUREMENT_ECONOMY_SCHEDULER',
      boundary: 'Value-of-information optimization subscription; does not own sensor hardware or operate inspection service fleets.',
      calibrationMoat: 'Instrument sensitivity and noise parameters calibrated continuously from ground-truth verified tasking order histories.',
    },
    instruments,
    historicalTaskingOrdersCount: FIXTURE_TASKING_ORDERS.length,
  });
}
