import { CoordinationError } from '@/coordination/ledger';
import { coordinationJson as json, coordinationError as errorResponse, requireLocalRequest as localRequest, readCoordinationCommand as body } from '@/coordination/http';
import { executeCoordinationCommand, getCoordinationSnapshot, localCoordinationEnabled } from '@/coordination/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    if (localCoordinationEnabled()) localRequest(request);
    return json(await getCoordinationSnapshot());
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    if (!localCoordinationEnabled()) throw new CoordinationError('READ_ONLY', 'Start npm run dev:coordination to use the local board.', 403);
    localRequest(request);
    return json(await executeCoordinationCommand(await body(request)));
  } catch (error) { return errorResponse(error); }
}
