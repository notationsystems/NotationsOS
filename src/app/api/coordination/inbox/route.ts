import { coordinationJson, coordinationError, requireLocalRequest } from '@/coordination/http';
import { inboxFor, parseInboxQuery } from '@/coordination/inbox';
import { getCoordinationSnapshot, localCoordinationEnabled } from '@/coordination/store';
import type { CoordinationInbox } from '@/coordination/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    if (localCoordinationEnabled()) requireLocalRequest(request);
    const query = parseInboxQuery(new URL(request.url).searchParams);
    const snapshot = await getCoordinationSnapshot();
    const result: CoordinationInbox = { ...inboxFor(snapshot, snapshot.scope, query), schema: 'payload.coordination-inbox.v1', fixture_only: true, scope: snapshot.scope, mode: snapshot.mode, canWrite: snapshot.canWrite };
    return coordinationJson(result);
  } catch (error) { return coordinationError(error); }
}
