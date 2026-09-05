import { disabledKernelSnapshot, notationRepository, stateKernelEnabled } from '@/state-kernel/store';
import { requireStateRequest, stateError, stateJson } from '@/state-kernel/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    if (!stateKernelEnabled()) return stateJson(disabledKernelSnapshot());
    requireStateRequest(request);
    return stateJson(await notationRepository().read());
  } catch (error) { return stateError(error); }
}
