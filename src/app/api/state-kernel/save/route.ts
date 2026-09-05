import { notationRepository } from '@/state-kernel/store';
import { readStateRequest, requireStateRequest, stateError, stateJson } from '@/state-kernel/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    requireStateRequest(request, true);
    const input = await readStateRequest(request);
    return stateJson(await notationRepository().save(input));
  } catch (error) { return stateError(error); }
}
