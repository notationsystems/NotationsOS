import { NextRequest } from 'next/server';
import { json } from '../../../_lib';
import { FIXTURE_BITEMPORAL_OBSERVATIONS } from '@/fixtures/frontier/productionCorpus';
import { buildInsurabilityPressureMart } from '@/domain/productionPipeline';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const asOf = searchParams.get('asOf') || new Date().toISOString();

  const mart = buildInsurabilityPressureMart(FIXTURE_BITEMPORAL_OBSERVATIONS, asOf);

  return json({
    schema: 'payload.frontier.insurability.mart.fips-pressure.v1',
    asOfKnowledgeTime: asOf,
    count: mart.length,
    doctrine: {
      role: 'MATERIALIZED_MART_VIEW',
      description: 'Precomputed county-level carrier withdrawal density, emergency moratorium indicators, and composite insurability pressure score.',
    },
    counties: mart,
  });
}

