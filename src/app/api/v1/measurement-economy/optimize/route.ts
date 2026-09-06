import { NextRequest, NextResponse } from 'next/server';
import { optimizeInspectionTasking, type ProjectMilestoneDrawContext } from '@/domain/n11MeasurementEconomy';
import { FIXTURE_PROJECT_DRAWS } from '@/fixtures/frontier/insurabilityAndN11';
import { getActiveParameterSet } from '@/domain/parameterRegistry';
import { FIXTURE_TASKING_ORDERS } from '@/fixtures/frontier/productionCorpus';

export async function POST(req: NextRequest) {
  try {
    let context: ProjectMilestoneDrawContext = FIXTURE_PROJECT_DRAWS[0];
    const text = await req.text();
    if (text.trim().length > 0) {
      const parsed = JSON.parse(text);
      if (parsed.context) {
        context = parsed.context;
      } else if (parsed.requestedDrawAmountCents) {
        context = parsed as ProjectMilestoneDrawContext;
      }
    }

    const paramSet = getActiveParameterSet();
    const schedule = optimizeInspectionTasking(context, {
      paramSet,
      taskingHistory: FIXTURE_TASKING_ORDERS,
    });

    return NextResponse.json({
      schema: 'payload.frontier.measurement-economy.optimization.v1',
      parameterSetVersion: paramSet.version,
      parameterSetDigest: paramSet.parameterSetDigest,
      confidentialityContract: 'EPHEMERAL_PROCESSING_ONLY_ZERO_RETENTION',
      ...schedule,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'invalid_request',
        message: error instanceof Error ? error.message : 'Failed to optimize measurement tasking',
      },
      { status: 400 }
    );
  }
}
