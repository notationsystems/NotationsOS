import { NextRequest, NextResponse } from 'next/server';
import type { TaskingOrderRecord } from '@/domain/productionPipeline';
import { calibrateInstrumentFromHistory } from '@/domain/productionPipeline';
import { FIXTURE_TASKING_ORDERS } from '@/fixtures/frontier/productionCorpus';
import type { MeasurementInstrumentId } from '@/domain/n11MeasurementEconomy';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, instrumentId, defectActuallyExisted, instrumentDetectedDefect, turnaroundHoursElapsed } = body;

    if (!orderId || !instrumentId) {
      return NextResponse.json(
        { error: 'missing_fields', message: 'orderId and instrumentId are required' },
        { status: 400 }
      );
    }

    const newOrder: TaskingOrderRecord = {
      orderId,
      projectId: body.projectId || 'PRJ-LIVE-RECORD',
      targetMilestone: body.targetMilestone || 'Ground Truth Verification Inspection',
      instrumentId: instrumentId as MeasurementInstrumentId,
      status: 'CALIBRATED',
      dispatchedAt: body.dispatchedAt || new Date(Date.now() - 86400000).toISOString(),
      observedAt: new Date().toISOString(),
      calibrationRunAt: new Date().toISOString(),
      priors: {
        assumedSensitivity: body.assumedSensitivity || 0.95,
        assumedFalseAlarmRate: body.assumedFalseAlarmRate || 0.05,
        authorizedCostCents: body.authorizedCostCents || 1000000,
      },
      observationOutcome: {
        defectActuallyExisted: Boolean(defectActuallyExisted),
        instrumentDetectedDefect: Boolean(instrumentDetectedDefect),
        turnaroundHoursElapsed: Number(turnaroundHoursElapsed || 24),
        measuredNoiseVarianceMm: Number(body.measuredNoiseVarianceMm || 2.5),
      },
    };

    const combinedHistory = [...FIXTURE_TASKING_ORDERS, newOrder];
    const calibration = calibrateInstrumentFromHistory(instrumentId, combinedHistory);

    return NextResponse.json({
      schema: 'payload.frontier.measurement-economy.tasking.observe.v1',
      status: 'OBSERVATION_RECORDED_AND_CALIBRATED',
      recordedOrder: newOrder,
      updatedCalibration: calibration,
      doctrine: {
        rule: 'Close the N11 loop. Store every N11-TASK-* with its eventual observation outcome.',
        moat: 'Sensor noise and sensitivity parameters stop being vendor-spec guesses and become empirically fitted. The calibration history is the moat.',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'invalid_request',
        message: error instanceof Error ? error.message : 'Failed to record tasking observation outcome',
      },
      { status: 400 }
    );
  }
}
