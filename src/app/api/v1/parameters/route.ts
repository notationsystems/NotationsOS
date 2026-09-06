import { NextResponse } from 'next/server';
import { getActiveParameterSet } from '@/domain/parameterRegistry';

export async function GET() {
  const paramSet = getActiveParameterSet();

  return NextResponse.json({
    schema: 'payload.frontier.parameter-registry.v1',
    version: paramSet.version,
    parameterSetDigest: paramSet.parameterSetDigest,
    publishedAt: paramSet.publishedAt,
    authorizingEntity: paramSet.authorizingEntity,
    doctrine: {
      rule: 'All model priors, multipliers, covenant thresholds, and metrology noise parameters must be versioned, cited rows — never magic numbers in code.',
      validationStandard: 'ISAE 3000 / Basel Committee Model Risk Governance',
    },
    parametersCount: Object.keys(paramSet.parameters).length,
    parameters: paramSet.parameters,
  });
}
