import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SourceRegistration } from '../data-os/contracts';
import { byteDigest, storageKeyFor } from '../data-os/evidence-capture';
import { LocalEvidenceIntake } from '../data-os/local-intake';
import { encodeLocalRecord, localRecordDigest } from '../data-os/local-record';
import type { ArtifactReference } from '../observation/contract';
import { SAMSARA_MAX_RECORD, SAMSARA_PURPOSE, type SamsaraAuthorization, type SamsaraCaptureRequest } from './samsara-contract';
import { runSamsaraDemo, syntheticSamsaraGpsResponse } from './samsara-demo';
import type { fetchSamsaraHistoryBytes } from './samsara-http';
import { SamsaraCaptureStore } from './samsara-store';

const NOW = '2026-09-05T12:00:00.000Z';
const STORED = '2026-09-05T11:00:00.000Z';
const UNTIL = '2026-09-06T11:00:00.000Z';
const TOKEN = 'samsara_api-private-TEST-credential_123';
const roots: string[] = [];
function temporary() {
  const root = mkdtempSync(join(tmpdir(), 'payload-samsara-store-')); roots.push(root); return root;
}
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    if (resolve(root) === resolve(tmpdir()) || relative(resolve(tmpdir()), resolve(root)).startsWith('..')
      || !basename(root).startsWith('payload-samsara-store-')) throw new Error('Unsafe test cleanup target');
    rmSync(root, { recursive: true, force: true });
  }
});
function files(root: string): Record<string, string> {
  const found: Record<string, string> = {};
  const walk = (directory: string) => {
    if (!existsSync(directory)) return;
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isDirectory()) walk(path);
      else found[relative(root, path)] = byteDigest(readFileSync(path));
    }
  };
  walk(root); return found;
}
function recordPath(root: string, id: string, name: string) {
  return join(root, 'samsara-captures', byteDigest(Buffer.from(id)).slice(7), name);
}
function mutateRecord(path: string, change: (value: Record<string, unknown>) => void, reseal = true) {
  const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  change(value);
  if (reseal) { delete value.digest; value.digest = localRecordDigest(value, SAMSARA_MAX_RECORD); }
  writeFileSync(path, JSON.stringify(value));
}
function policy(id: string): SourceRegistration {
  return { registrationId: id, sourceId: 'samsara-vehicle-gps', displayName: 'Explicit local test permission',
    sourceClass: 'synthetic-test', licenseId: 'synthetic-test-only', policyVersion: '1.0.0',
    effectiveFrom: '2026-09-05T10:59:00.000Z', effectiveUntil: UNTIL,
    permittedPurposes: [SAMSARA_PURPOSE], allowedOperations: ['INGEST', 'DERIVE', 'RETRIEVE'],
    allowedAudiences: ['INTERNAL'], retention: { mode: 'UNTIL', until: UNTIL } };
}
type Setup = {
  root?: string; suffix?: string; now?: string; token?: string | undefined; mode?: 'LIVE_HTTPS' | 'SYNTHETIC_OFFLINE';
  termsPolicy?: (p: SourceRegistration) => void; authorizationPolicy?: (p: SourceRegistration) => void;
  declaration?: (a: SamsaraAuthorization) => void;
};
function fixture(options: Setup = {}) {
  const root = options.root ?? temporary(), suffix = options.suffix ?? 'one';
  const intake = new LocalEvidenceIntake(root), clock = { at: options.now ?? NOW };
  const rawPolicy = policy(`raw-${suffix}`), authPolicy = policy(`auth-${suffix}`), termsPolicy = policy(`terms-${suffix}`);
  options.authorizationPolicy?.(authPolicy); options.termsPolicy?.(termsPolicy);
  const capture = (id: string, value: unknown, sourceRegistration: SourceRegistration): ArtifactReference => {
    const a = intake.capture({ schema: 'payload.local-intake-request.v1', acquisitionId: id, evidenceId: `${id}-evidence`,
      purpose: SAMSARA_PURPOSE, mediaType: 'application/json', sourceRegistration, capturedAt: STORED }, encodeLocalRecord(value), STORED).acquisition;
    return { acquisitionId: id, acquisitionDigest: a.digest, contentDigest: a.request.contentDigest };
  };
  const terms = capture(`terms-${suffix}`, { statement: 'Synthetic fixture terms only', suffix }, termsPolicy);
  const declaration: SamsaraAuthorization = {
    schema: 'payload.samsara-authorization.v1', connectionId: 'test-connection', fleetId: 'test-fleet',
    authority: 'FLEET_OPERATOR_DECLARATION', evidenceClass: 'SYNTHETIC_TEST', organizationBinding: 'OPERATOR_DECLARED_NOT_PROVIDER_VERIFIED',
    providerApiVersion: 'UNVERIFIED', privacyBasis: 'Invented test observations only', termsEvidence: terms,
    scope: { region: 'CA', vehicleId: '1234567890123456789', startTime: '2026-09-05T11:30:00.000Z', endTime: '2026-09-05T11:40:00.000Z' },
    sourceRegistration: rawPolicy,
  };
  options.declaration?.(declaration);
  const authorization = capture(`authorization-${suffix}`, declaration, authPolicy);
  const request: SamsaraCaptureRequest = { schema: 'payload.samsara-capture-request.v1', requestId: `capture-${suffix}`, authorization };
  const fetch = vi.fn<typeof fetchSamsaraHistoryBytes>().mockImplementation(async (scope) => ({
    bytes: encodeLocalRecord(syntheticSamsaraGpsResponse(scope)), mediaType: 'application/json',
  }));
  const token = vi.fn(() => Object.hasOwn(options, 'token') ? options.token : TOKEN);
  const dependencies = { fetch, now: () => clock.at, token, mode: options.mode ?? 'SYNTHETIC_OFFLINE' as const };
  const store = new SamsaraCaptureStore(root, dependencies);
  return { root, intake, clock, declaration, request, fetch, token, store, dependencies, terms };
}
function responseAcquisition(f: ReturnType<typeof fixture>) { return f.intake.inspect(`samsara-response:${f.request.requestId}`); }

describe('Samsara evidence-bound history capture', () => {
  it('preserves one exact response, derives bounded observations, and reopens without credentials or writes', async () => {
    const f = fixture(); const before = files(f.root);
    const result = await f.store.capture(f.request, true);
    expect(result.state).toBe('CAPTURED'); expect(result.intent.transport).toBe('SYNTHETIC_OFFLINE');
    expect(result.source).toMatchObject({ evidenceClass: 'SYNTHETIC_TEST', fleetId: 'test-fleet', scope: { region: 'CA' },
      organizationBinding: 'OPERATOR_DECLARED_NOT_PROVIDER_VERIFIED', providerApiVersion: 'UNVERIFIED' });
    expect(result.observations?.observations).toHaveLength(3);
    expect(result.observations?.observations[0]).toMatchObject({ vehicleId: f.declaration.scope.vehicleId, identityStatus: 'UNRESOLVED',
      canonicalId: null, positioningAccuracy: 'NOT_PROVIDED', rtkStatus: 'NOT_PROVIDED' });
    expect(Object.values(result.claims).every((claim) => claim === false)).toBe(true);
    expect(result.integrity).toBe('RECOMPUTED_LOCAL');
    const acquired = responseAcquisition(f)!;
    expect(Buffer.from(f.intake.objects.get(acquired.request.contentDigest)!)).toEqual(encodeLocalRecord(syntheticSamsaraGpsResponse(f.declaration.scope)));
    expect(result.acquisition).toEqual({ acquisitionId: acquired.request.manifest.acquisitionId, acquisitionDigest: acquired.digest, contentDigest: acquired.request.contentDigest });
    expect(f.fetch).toHaveBeenCalledOnce(); expect(f.fetch).toHaveBeenCalledWith(f.declaration.scope, TOKEN);
    expect(Object.keys(files(f.root))).toHaveLength(Object.keys(before).length + 7);
    const after = files(f.root);
    const reader = new SamsaraCaptureStore(f.root, { now: () => NOW, token: () => { throw new Error(TOKEN); }, fetch: f.fetch });
    expect(reader.inspect(f.request.requestId)).toEqual(result);
    expect(await reader.capture(f.request, false)).toEqual(result);
    expect(files(f.root)).toEqual(after); expect(f.fetch).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(JSON.stringify(result)).not.toContain('SYNTHETIC vehicle; no real fleet');
    for (const path of Object.keys(after)) expect(readFileSync(join(f.root, path)).includes(Buffer.from(TOKEN))).toBe(false);
  });

  it('permits a mocked live customer-fleet transport without claiming provider qualification or organization verification', async () => {
    const f = fixture({ mode: 'LIVE_HTTPS', declaration: (a) => { a.evidenceClass = 'CUSTOMER_FLEET'; a.sourceRegistration.sourceClass = 'authorized-fleet-telematics'; } });
    const result = await f.store.capture(f.request, true);
    expect(result.intent.transport).toBe('LIVE_HTTPS'); expect(result.source.evidenceClass).toBe('CUSTOMER_FLEET');
    expect(result.claims.liveQualificationEstablished).toBe(false); expect(result.claims.independentVerification).toBe(false);
  });

  it('keeps partial-page coverage and cursor as evidence without ever fetching another page', async () => {
    const f = fixture(); const body = syntheticSamsaraGpsResponse(f.declaration.scope);
    body.pagination = { hasNextPage: true, endCursor: 'another-page' };
    f.fetch.mockResolvedValue({ bytes: encodeLocalRecord(body), mediaType: 'application/json' });
    const result = await f.store.capture(f.request, true);
    expect(result.observations).toMatchObject({ coverage: 'PARTIAL_PAGE', pagination: body.pagination });
    expect(result.claims.continuousSynchronization).toBe(false); expect(f.fetch).toHaveBeenCalledOnce();
    expect(f.store.inspect(f.request.requestId)).toEqual(result);
  });

  it.each([[], [{ id: '1234567890123456789', gps: [] }], [{ id: '1234567890123456789' }]])('keeps absence %# as not returned, never a missing vehicle or visit conclusion', async (...data) => {
    const f = fixture(); f.fetch.mockResolvedValue({ bytes: encodeLocalRecord({ data, pagination: { hasNextPage: false, endCursor: '' } }), mediaType: 'application/json' });
    const result = await f.store.capture(f.request, true);
    expect(result.state).toBe('CAPTURED'); expect(result.observations).toMatchObject({ availability: 'NOT_RETURNED', observations: [], coverage: 'SINGLE_PAGE_ONLY' });
  });

  it('does not let callers mutate subsequent readback', async () => {
    const f = fixture(); const result = await f.store.capture(f.request, true);
    result.observations!.observations[0].latitudeDegrees = 0; result.source.scope.vehicleId = '9'; result.claims.tokenIncluded = true as false;
    const readback = f.store.inspect(f.request.requestId)!;
    expect(readback.observations!.observations[0].latitudeDegrees).toBe(43.65);
    expect(readback.source.scope.vehicleId).toBe(f.declaration.scope.vehicleId); expect(readback.claims.tokenIncluded).toBe(false);
  });

  it('runs the offline demo without reading environment secrets or granting real permission', async () => {
    const root = temporary(); vi.stubEnv('PAYLOAD_SAMSARA_TOKEN', TOKEN); vi.stubEnv('PAYLOAD_SAMSARA_COLLECTION', '0');
    const result = await runSamsaraDemo(root, NOW), before = files(root);
    expect(result.state).toBe('CAPTURED'); expect(result.source.evidenceClass).toBe('SYNTHETIC_TEST');
    expect(result.claims.liveQualificationEstablished).toBe(false); expect(result.intent.transport).toBe('SYNTHETIC_OFFLINE');
    expect(await runSamsaraDemo(root, NOW)).toEqual(result); expect(files(root)).toEqual(before);
    await expect(runSamsaraDemo(root, '2026-09-13T12:00:00.000Z')).rejects.toThrow('SAMSARA_CURRENT_USE_NOT_ALLOWED');
    expect(files(root)).toEqual(before);
  });
});

describe('precontact authorization, scope, credentials, and local separation', () => {
  it('does not create even the selected root for a disabled missing request', async () => {
    const outer = temporary(), root = join(outer, 'not-created'), f = fixture();
    const store = new SamsaraCaptureStore(root, { fetch: f.fetch });
    await expect(store.capture(f.request, false)).rejects.toThrow('SAMSARA_COLLECTION_DISABLED'); expect(existsSync(root)).toBe(false); expect(f.fetch).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'Bearer private', 'private\r\nHeader', 'a'.repeat(4097)])('rejects missing or unsafe credential %# before any intent, binding, budget, or provider call', async (token) => {
    const f = fixture({ token }); const before = files(f.root);
    await expect(f.store.capture(f.request, true)).rejects.toThrow('SAMSARA_CREDENTIAL_UNAVAILABLE');
    expect(files(f.root)).toEqual(before); expect(f.fetch).not.toHaveBeenCalled();
  });

  it('sanitizes a failing token resolver before writes', async () => {
    const f = fixture(); f.token.mockImplementation(() => { throw new Error(TOKEN); }); const before = files(f.root);
    await expect(f.store.capture(f.request, true)).rejects.toThrow('SAMSARA_CREDENTIAL_UNAVAILABLE'); expect(files(f.root)).toEqual(before);
  });

  it('requires explicit enablement and ignores an environment flag other than exactly one', async () => {
    const f = fixture(); const before = files(f.root); vi.stubEnv('PAYLOAD_SAMSARA_COLLECTION', 'true');
    await expect(f.store.capture(f.request)).rejects.toThrow('SAMSARA_COLLECTION_DISABLED'); expect(files(f.root)).toEqual(before);
    expect(f.token).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
  });

  it.each(['terms', 'authorization'] as const)('requires current RETRIEVE and DERIVE separately for exact %s evidence', async (which) => {
    for (const missing of ['RETRIEVE', 'DERIVE'] as const) {
      const alter = (p: SourceRegistration) => { p.allowedOperations = p.allowedOperations.filter((op) => op !== missing); };
      const f = fixture(which === 'terms' ? { termsPolicy: alter } : { authorizationPolicy: alter }); const before = files(f.root);
      await expect(f.store.capture(f.request, true)).rejects.toThrow('SAMSARA_CURRENT_USE_NOT_ALLOWED');
      expect(files(f.root)).toEqual(before); expect(f.fetch).not.toHaveBeenCalled(); expect(f.token).not.toHaveBeenCalled();
    }
  });

  it.each(['terms', 'authorization'] as const)('checks current %s finite retention independently of effective policy time', async (which) => {
    const alter = (p: SourceRegistration) => { p.retention = { mode: 'UNTIL', until: NOW }; };
    const f = fixture(which === 'terms' ? { termsPolicy: alter } : { authorizationPolicy: alter }); const before = files(f.root);
    await expect(f.store.capture(f.request, true)).rejects.toThrow('SAMSARA_CURRENT_USE_NOT_ALLOWED');
    expect(files(f.root)).toEqual(before); expect(f.fetch).not.toHaveBeenCalled();
  });

  it.each(['INGEST', 'DERIVE', 'RETRIEVE'] as const)('does not use raw-data policy missing %s', async (missing) => {
    const f = fixture({ declaration: (a) => { a.sourceRegistration.allowedOperations = a.sourceRegistration.allowedOperations.filter((op) => op !== missing); } });
    const before = files(f.root); await expect(f.store.capture(f.request, true)).rejects.toThrow('SAMSARA_POLICY_SCOPE_INVALID');
    expect(files(f.root)).toEqual(before); expect(f.fetch).not.toHaveBeenCalled();
  });

  it.each(['expired', 'retention expired', 'prohibited purpose', 'approval required', 'customer distribution'] as const)('refuses %s raw-data authority before contact', async (kind) => {
    const f = fixture({ declaration: (a) => {
      if (kind === 'expired') a.sourceRegistration.effectiveUntil = NOW;
      if (kind === 'retention expired') a.sourceRegistration.retention = { mode: 'UNTIL', until: NOW };
      if (kind === 'prohibited purpose') a.sourceRegistration.prohibitedPurposes = [SAMSARA_PURPOSE];
      if (kind === 'approval required') a.sourceRegistration.approvalRequiredOperations = ['INGEST'];
      if (kind === 'customer distribution') a.sourceRegistration.allowedAudiences = ['INTERNAL', 'CUSTOMER'];
    } }); const before = files(f.root);
    await expect(f.store.capture(f.request, true)).rejects.toThrow(); expect(files(f.root)).toEqual(before); expect(f.fetch).not.toHaveBeenCalled();
  });

  it('refuses a future history scope and a clock preceding authorization storage', async () => {
    const f = fixture({ declaration: (a) => { a.scope.startTime = NOW; a.scope.endTime = '2026-09-05T12:10:00.000Z'; } });
    const before = files(f.root); await expect(f.store.capture(f.request, true)).rejects.toThrow('SAMSARA_FUTURE_WINDOW'); expect(files(f.root)).toEqual(before);
    f.clock.at = '2026-09-05T10:59:59.999Z'; await expect(f.store.capture(f.request, true)).rejects.toThrow('SAMSARA_BEFORE_AUTHORIZATION_STORAGE'); expect(f.fetch).not.toHaveBeenCalled();
  });

  it.each(['LIVE_HTTPS', 'SYNTHETIC_OFFLINE'] as const)('does not relabel an incompatible evidence class as %s', async (mode) => {
    const f = fixture({ mode, declaration: (a) => { if (mode === 'SYNTHETIC_OFFLINE') { a.evidenceClass = 'CUSTOMER_FLEET'; a.sourceRegistration.sourceClass = 'authorized-fleet-telematics'; } } });
    const before = files(f.root); await expect(f.store.capture(f.request, true)).rejects.toThrow('SAMSARA_EVIDENCE_CLASS_MISMATCH');
    expect(files(f.root)).toEqual(before); expect(f.fetch).not.toHaveBeenCalled();
  });

  it.each(['fleet', 'connection', 'region'] as const)('binds one root against conflicting %s while allowing other authorization records to coexist', async (change) => {
    const f = fixture(); await f.store.capture(f.request, true);
    const second = fixture({ root: f.root, suffix: 'two', now: '2026-09-05T12:01:00.000Z', declaration: (a) => {
      if (change === 'fleet') a.fleetId = 'other-fleet'; if (change === 'connection') a.connectionId = 'other-connection'; if (change === 'region') a.scope.region = 'EU';
    } }); const before = files(f.root);
    await expect(second.store.capture(second.request, true)).rejects.toThrow('SAMSARA_LOCAL_BINDING_CONFLICT');
    expect(files(f.root)).toEqual(before); expect(second.fetch).not.toHaveBeenCalled();
  });

  it('cannot resolve authorization by identifier alone or by moving a request to an unrelated root', async () => {
    const f = fixture(); const before = files(f.root);
    for (const field of ['acquisitionDigest', 'contentDigest'] as const) {
      await expect(f.store.capture({ ...f.request, authorization: { ...f.request.authorization, [field]: `sha256:${'0'.repeat(64)}` } }, true)).rejects.toThrow('SAMSARA_EVIDENCE_UNAVAILABLE_OR_CHANGED');
    }
    const empty = temporary(), other = new SamsaraCaptureStore(empty, f.dependencies);
    await expect(other.capture(f.request, true)).rejects.toThrow('SAMSARA_EVIDENCE_UNAVAILABLE_OR_CHANGED');
    expect(files(empty)).toEqual({}); expect(files(f.root)).toEqual(before); expect(f.fetch).not.toHaveBeenCalled();
  });
});

describe('privacy gating and terminal attempt history', () => {
  it.each(['terms', 'authorization', 'raw'] as const)('blocks expired %s readback and exact retry without deletion, new output, renewal, or contact', async (target) => {
    const setRetention = (p: SourceRegistration) => { p.retention = { mode: 'UNTIL', until: '2026-09-05T12:00:00.001Z' }; };
    const f = fixture(target === 'terms' ? { termsPolicy: setRetention } : target === 'authorization' ? { authorizationPolicy: setRetention }
      : { declaration: (a) => setRetention(a.sourceRegistration) });
    await f.store.capture(f.request, true); const before = files(f.root); f.clock.at = '2026-09-05T12:00:00.001Z';
    expect(() => f.store.inspect(f.request.requestId)).toThrow('SAMSARA_CURRENT_USE_NOT_ALLOWED');
    await expect(f.store.capture(f.request, true)).rejects.toThrow('SAMSARA_CURRENT_USE_NOT_ALLOWED');
    expect(files(f.root)).toEqual(before); expect(f.fetch).toHaveBeenCalledOnce();
  });

  it('rechecks permission after fetch and retains no body if it expires while in flight', async () => {
    const f = fixture(); f.fetch.mockImplementation(async (scope) => { f.clock.at = UNTIL; return { bytes: encodeLocalRecord(syntheticSamsaraGpsResponse(scope)), mediaType: 'application/json' }; });
    await expect(f.store.capture(f.request, true)).rejects.toThrow('SAMSARA_CURRENT_USE_NOT_ALLOWED');
    expect(responseAcquisition(f)).toBeUndefined(); expect(existsSync(recordPath(f.root, f.request.requestId, 'receipt.json'))).toBe(false);
    expect(f.fetch).toHaveBeenCalledOnce(); expect(() => f.store.inspect(f.request.requestId)).toThrow('SAMSARA_CURRENT_USE_NOT_ALLOWED');
  });

  it('publishes a bounded failed attempt without exposing diagnostics and never recaptures its id', async () => {
    const f = fixture(); f.fetch.mockRejectedValue(new Error(TOKEN));
    const result = await f.store.capture(f.request, true), before = files(f.root);
    expect(result).toMatchObject({ state: 'FAILED', receipt: { failureCode: 'FETCH_FAILED', acquisition: null, observationsDigest: null }, acquisition: null, observations: null });
    expect(JSON.stringify(result)).not.toContain(TOKEN); expect(responseAcquisition(f)).toBeUndefined();
    f.fetch.mockImplementation(async (scope) => ({ bytes: encodeLocalRecord(syntheticSamsaraGpsResponse(scope)), mediaType: 'application/json' }));
    expect(await f.store.capture(f.request, true)).toEqual(result); expect(files(f.root)).toEqual(before); expect(f.fetch).toHaveBeenCalledOnce();
  });

  it('exposes an in-flight attempt as incomplete and does not launch a concurrent retry', async () => {
    const f = fixture(); let finish!: (value: Awaited<ReturnType<typeof fetchSamsaraHistoryBytes>>) => void;
    f.fetch.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const first = f.store.capture(f.request, true);
    const before = files(f.root), second = await f.store.capture(f.request, true);
    expect(second.state).toBe('INCOMPLETE'); expect(second.receipt).toBeNull(); expect(second.acquisition).toBeNull();
    expect(files(f.root)).toEqual(before); expect(f.fetch).toHaveBeenCalledOnce();
    finish({ bytes: encodeLocalRecord(syntheticSamsaraGpsResponse(f.declaration.scope)), mediaType: 'application/json' });
    expect((await first).state).toBe('CAPTURED'); expect(f.store.inspect(f.request.requestId)!.state).toBe('CAPTURED');
  });

  it('keeps crash-window acquisition history incomplete rather than recapturing or manufacturing a receipt', async () => {
    const f = fixture(); await f.store.capture(f.request, true);
    rmSync(recordPath(f.root, f.request.requestId, 'receipt.json')); const before = files(f.root);
    const result = await f.store.capture(f.request, true);
    expect(result.state).toBe('INCOMPLETE'); expect(result.acquisition).not.toBeNull(); expect(result.observations).toBeNull();
    expect(files(f.root)).toEqual(before); expect(f.fetch).toHaveBeenCalledOnce();
  });

  it('refuses reused attempt identity with different exact authorization even while incomplete', async () => {
    const f = fixture(); let finish!: (value: Awaited<ReturnType<typeof fetchSamsaraHistoryBytes>>) => void;
    f.fetch.mockImplementation(() => new Promise((resolve) => { finish = resolve; })); const first = f.store.capture(f.request, true);
    const second = fixture({ root: f.root, suffix: 'two' }); const before = files(f.root);
    await expect(second.store.capture({ ...second.request, requestId: f.request.requestId }, true)).rejects.toThrow('SAMSARA_REQUEST_CONFLICT');
    expect(files(f.root)).toEqual(before); expect(second.fetch).not.toHaveBeenCalled();
    finish({ bytes: encodeLocalRecord(syntheticSamsaraGpsResponse(f.declaration.scope)), mediaType: 'application/json' }); await first;
  });

  it('rejects a reversing clock after contact and leaves a non-retryable incomplete intent', async () => {
    const f = fixture(); f.fetch.mockImplementation(async (scope) => { f.clock.at = '2026-09-05T11:59:59.999Z'; return { bytes: encodeLocalRecord(syntheticSamsaraGpsResponse(scope)), mediaType: 'application/json' }; });
    await expect(f.store.capture(f.request, true)).rejects.toThrow('SAMSARA_CLOCK_REVERSED'); expect(responseAcquisition(f)).toBeUndefined();
    f.clock.at = NOW; const before = files(f.root); expect((await f.store.capture(f.request, true)).state).toBe('INCOMPLETE');
    expect(files(f.root)).toEqual(before); expect(f.fetch).toHaveBeenCalledOnce();
  });
});

describe('pre-retention credential and response checks', () => {
  it.each([
    ['literal value', JSON.stringify({ private: TOKEN })], ['literal key', JSON.stringify({ [TOKEN]: true })],
    ['escaped value', `{"value":"${[...TOKEN].map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`).join('')}"}`],
    ['escaped key', `{"${[...TOKEN].map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`).join('')}":true}`],
    ['nested escaped value', `{"nested":[{"value":"prefix-${TOKEN.replace('s', '\\u0073')}-suffix"}]}`],
    ['malformed JSON', '{'], ['duplicate JSON keys', '{"data":[],"data":[],"pagination":{"hasNextPage":false,"endCursor":""}}'],
    ['duplicate escaped key', '{"data":[],"d\\u0061ta":[],"pagination":{"hasNextPage":false,"endCursor":""}}'],
  ])('does not retain %s', async (_label, body) => {
    const f = fixture(), bytes = Buffer.from(body), digest = byteDigest(bytes);
    f.fetch.mockResolvedValue({ bytes, mediaType: 'application/json' });
    const result = await f.store.capture(f.request, true);
    expect(result).toMatchObject({ state: 'FAILED', receipt: { failureCode: 'FETCH_FAILED', acquisition: null }, observations: null });
    expect(responseAcquisition(f)).toBeUndefined(); expect(f.intake.objects.get(digest)).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(TOKEN); expect(f.store.inspect(f.request.requestId)).toEqual(result);
    const before = files(f.root); expect(await f.store.capture(f.request, true)).toEqual(result); expect(files(f.root)).toEqual(before); expect(f.fetch).toHaveBeenCalledOnce();
  });

  it.each([
    ['invalid UTF-8', Buffer.from([0xff])], ['empty', Buffer.alloc(0)], ['too large', Buffer.alloc(256 * 1024 + 1, 32)],
  ])('does not retain %s bytes', async (_label, bytes) => {
    const f = fixture(); f.fetch.mockResolvedValue({ bytes, mediaType: 'application/json' });
    expect((await f.store.capture(f.request, true)).state).toBe('FAILED'); expect(responseAcquisition(f)).toBeUndefined();
    expect(f.intake.objects.get(byteDigest(bytes))).toBeUndefined();
  });

  it('does not trust injected transport non-buffer or non-JSON responses', async () => {
    for (const result of [{ bytes: '{}', mediaType: 'application/json' }, { bytes: Buffer.from('{}'), mediaType: 'text/html' }]) {
      const f = fixture(); f.fetch.mockResolvedValue(result as Awaited<ReturnType<typeof fetchSamsaraHistoryBytes>>);
      expect((await f.store.capture(f.request, true)).state).toBe('FAILED'); expect(responseAcquisition(f)).toBeUndefined();
    }
  });

  it.each(['wrong vehicle', 'extra vehicle', 'out-of-scope time', 'missing time', 'unexpected field', 'unknown version', 'JSON null'] as const)('discards %s before retaining any private body bytes', async (kind) => {
    const f = fixture(), body: Record<string, unknown> = syntheticSamsaraGpsResponse(f.declaration.scope);
    const vehicle = (body.data as { id: string; gps: { time: string; latitude: number }[] }[])[0];
    if (kind === 'wrong vehicle') vehicle.id = '99';
    if (kind === 'extra vehicle') (body.data as unknown[]).push({ id: '99', gps: [] });
    if (kind === 'out-of-scope time') vehicle.gps[0].time = NOW;
    if (kind === 'missing time') delete (vehicle.gps[0] as Partial<typeof vehicle.gps[0]>).time;
    if (kind === 'unexpected field') body.driver = { name: 'private contextual text not in output' };
    if (kind === 'unknown version') body.schemaVersion = 'future';
    const bytes = encodeLocalRecord(kind === 'JSON null' ? null : body); f.fetch.mockResolvedValue({ bytes, mediaType: 'application/json' });
    const result = await f.store.capture(f.request, true);
    expect(result).toMatchObject({ state: 'FAILED', receipt: { failureCode: 'FETCH_FAILED', acquisition: null }, observations: null });
    expect(responseAcquisition(f)).toBeUndefined(); expect(f.intake.objects.get(byteDigest(bytes))).toBeUndefined();
    expect(f.store.inspect(f.request.requestId)).toEqual(result); expect(JSON.stringify(result)).not.toContain('private contextual');
  });

  it.each(['impossible latitude', 'impossible heading', 'negative speed'] as const)('retains scope-safe JSON but quarantines %s measurement semantics', async (kind) => {
    const f = fixture(), body = syntheticSamsaraGpsResponse(f.declaration.scope), gps = body.data[0].gps[0];
    if (kind === 'impossible latitude') gps.latitude = 91;
    if (kind === 'impossible heading') gps.headingDegrees = 999;
    if (kind === 'negative speed') gps.speedMilesPerHour = -1;
    const bytes = encodeLocalRecord(body); f.fetch.mockResolvedValue({ bytes, mediaType: 'application/json' });
    const result = await f.store.capture(f.request, true), acquired = responseAcquisition(f)!;
    expect(result).toMatchObject({ state: 'QUARANTINED', receipt: { failureCode: 'INVALID_GPS_RESPONSE', observationsDigest: null }, observations: null });
    expect(Buffer.from(f.intake.objects.get(acquired.request.contentDigest)!)).toEqual(bytes);
    expect(result.acquisition).not.toBeNull(); expect(f.store.inspect(f.request.requestId)).toEqual(result);
  });
});

describe('bounded local attempt budget', () => {
  it('permits one intent per UTC minute and counts failed fetches without retry', async () => {
    const f = fixture(); f.fetch.mockRejectedValue(new Error('private'));
    expect((await f.store.capture(f.request, true)).receipt?.failureCode).toBe('FETCH_FAILED');
    const second = { ...f.request, requestId: 'second-attempt' };
    const denied = await f.store.capture(second, true);
    expect(denied).toMatchObject({ state: 'FAILED', receipt: { failureCode: 'LOCAL_BUDGET_EXHAUSTED', acquisition: null } });
    expect(f.fetch).toHaveBeenCalledOnce(); expect(f.store.inspect(second.requestId)).toEqual(denied);
    f.clock.at = '2026-09-05T12:01:00.000Z'; const before = files(f.root);
    expect(await f.store.capture(second, true)).toEqual(denied); expect(files(f.root)).toEqual(before); expect(f.fetch).toHaveBeenCalledOnce();
    expect((await f.store.capture({ ...f.request, requestId: 'third-attempt' }, true)).receipt?.failureCode).toBe('FETCH_FAILED'); expect(f.fetch).toHaveBeenCalledTimes(2);
  });

  it('permits four distinct UTC-minute attempts per day, then retains budget denial without a fifth contact', async () => {
    const f = fixture();
    for (let slot = 0; slot < 4; slot++) {
      f.clock.at = `2026-09-05T12:0${slot}:00.000Z`;
      expect((await f.store.capture({ ...f.request, requestId: `slot-${slot}` }, true)).state).toBe('CAPTURED');
    }
    f.clock.at = '2026-09-05T12:04:00.000Z';
    const result = await f.store.capture({ ...f.request, requestId: 'slot-4' }, true);
    expect(result.receipt?.failureCode).toBe('LOCAL_BUDGET_EXHAUSTED'); expect(f.fetch).toHaveBeenCalledTimes(4);
    expect(f.store.inspect('slot-4')).toEqual(result);
    expect(readdirSync(join(f.root, 'samsara-budgets', '2026-09-05')).filter((name) => name.startsWith('day-'))).toHaveLength(4);
  });

  it('allows a new UTC day only while authorization remains current', async () => {
    const f = fixture(); await f.store.capture(f.request, true);
    f.clock.at = '2026-09-06T00:00:00.000Z'; expect((await f.store.capture({ ...f.request, requestId: 'next-day' }, true)).state).toBe('CAPTURED');
    expect(existsSync(join(f.root, 'samsara-budgets', '2026-09-06', 'day-0.json'))).toBe(true);
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects missing, malformed, or reassigned budget history on readback', async () => {
    for (const mutation of ['missing minute', 'missing day', 'wrong digest', 'extra header']) {
      const f = fixture(); await f.store.capture(f.request, true);
      const path = join(f.root, 'samsara-budgets', '2026-09-05', mutation === 'missing day' ? 'day-0.json' : 'minute-12-00.json');
      if (mutation.startsWith('missing')) rmSync(path);
      else writeFileSync(path, JSON.stringify({ schema: 'payload.samsara-budget.v1', intentDigest: `sha256:${'0'.repeat(64)}`, ...(mutation === 'extra header' ? { authorization: TOKEN } : {}) }));
      const before = files(f.root); expect(() => f.store.inspect(f.request.requestId)).toThrow('SAMSARA_BUDGET_HISTORY_INVALID');
      expect(files(f.root)).toEqual(before); expect(f.fetch).toHaveBeenCalledOnce();
    }
  });
});

describe('sealed history and exact source integrity', () => {
  it.each(['intent', 'receipt'] as const)('refuses unsealed %s mutation without repairing it', async (kind) => {
    const f = fixture(); await f.store.capture(f.request, true);
    mutateRecord(recordPath(f.root, f.request.requestId, `${kind}.json`), (r) => { r.digest = `sha256:${'0'.repeat(64)}`; }, false);
    const before = files(f.root); expect(() => f.store.inspect(f.request.requestId)).toThrow('SAMSARA_HISTORY_INVALID');
    expect(files(f.root)).toEqual(before); expect(f.fetch).toHaveBeenCalledOnce();
  });

  it.each(['Authorization', 'token', 'headers', 'rawBytes', 'url'])('rejects injected %s in a rehashed intent or receipt', async (field) => {
    for (const file of ['intent.json', 'receipt.json']) {
      const f = fixture(); await f.store.capture(f.request, true);
      mutateRecord(recordPath(f.root, f.request.requestId, file), (r) => { r[field] = TOKEN; });
      const before = files(f.root); expect(() => f.store.inspect(f.request.requestId)).toThrow();
      expect(files(f.root)).toEqual(before); expect(f.fetch).toHaveBeenCalledOnce();
    }
  });

  it.each(['adapter', 'transport', 'nonce', 'requestDigest', 'schema', 'startedAt'])('rejects structurally rehashed intent %s corruption', async (field) => {
    const f = fixture(); await f.store.capture(f.request, true);
    mutateRecord(recordPath(f.root, f.request.requestId, 'intent.json'), (r) => { r[field] = field === 'startedAt' ? '2026-09-05T12:00:00Z' : 'invalid'; });
    expect(() => f.store.inspect(f.request.requestId)).toThrow(); expect(f.fetch).toHaveBeenCalledOnce();
  });

  it('rejects a rehashed array nonce even if its string coercion would match the original UUID', async () => {
    const f = fixture(); await f.store.capture(f.request, true);
    mutateRecord(recordPath(f.root, f.request.requestId, 'intent.json'), (r) => { r.nonce = [r.nonce]; });
    expect(() => f.store.inspect(f.request.requestId)).toThrow('SAMSARA_HISTORY_INVALID');
  });

  it.each(['schema', 'intentDigest', 'state', 'failureCode', 'observationsDigest', 'finishedAt'])('rejects structurally rehashed receipt %s corruption', async (field) => {
    const f = fixture(); await f.store.capture(f.request, true);
    mutateRecord(recordPath(f.root, f.request.requestId, 'receipt.json'), (r) => { r[field] = field === 'finishedAt' ? '2026-09-05T11:59:00.000Z' : 'invalid'; });
    expect(() => f.store.inspect(f.request.requestId)).toThrow('SAMSARA_HISTORY_INVALID'); expect(f.fetch).toHaveBeenCalledOnce();
  });

  it.each([false, 0, ''])('rejects failed receipts with rehashed non-null acquisition %#', async (acquisition) => {
    const f = fixture(); f.fetch.mockRejectedValue(new Error('private')); await f.store.capture(f.request, true);
    mutateRecord(recordPath(f.root, f.request.requestId, 'receipt.json'), (r) => { r.acquisition = acquisition; });
    expect(() => f.store.inspect(f.request.requestId)).toThrow('SAMSARA_HISTORY_INVALID');
  });

  it('detects source byte changes even with unchanged filenames and refuses orphan receipt history', async () => {
    const f = fixture(); const result = await f.store.capture(f.request, true);
    const objectPath = join(f.root, 'objects', ...storageKeyFor(result.acquisition!.contentDigest).split('/'));
    writeFileSync(objectPath, Buffer.from('{}')); const before = files(f.root);
    expect(() => f.store.inspect(f.request.requestId)).toThrow(); expect(files(f.root)).toEqual(before);
    const other = fixture(); await other.store.capture(other.request, true); rmSync(recordPath(other.root, other.request.requestId, 'intent.json'));
    expect(() => other.store.inspect(other.request.requestId)).toThrow('SAMSARA_ORPHANED_HISTORY');
  });

  it('rejects changed exact authorization bytes and changed root binding without output or repair', async () => {
    const f = fixture(); await f.store.capture(f.request, true);
    writeFileSync(join(f.root, 'samsara-binding.json'), JSON.stringify({ schema: 'payload.samsara-local-binding.v1', connectionId: 'test-connection', fleetId: 'other-fleet', region: 'CA', organizationBinding: 'OPERATOR_DECLARED_NOT_PROVIDER_VERIFIED' }));
    expect(() => f.store.inspect(f.request.requestId)).toThrow('SAMSARA_LOCAL_BINDING_CONFLICT');
    const other = fixture(); await other.store.capture(other.request, true);
    const path = join(other.root, 'objects', ...storageKeyFor(other.request.authorization.contentDigest).split('/'));
    writeFileSync(path, Buffer.from('{}')); const before = files(other.root);
    expect(() => other.store.inspect(other.request.requestId)).toThrow(); expect(files(other.root)).toEqual(before);
  });

  it('rejects invalid inspect identifiers without filesystem writes', () => {
    const root = temporary(), store = new SamsaraCaptureStore(root);
    for (const id of ['', '../escape', 'a'.repeat(81), 'private/id', 'é']) expect(() => store.inspect(id)).toThrow('SAMSARA_ID_INVALID');
    expect(files(root)).toEqual({});
  });

  it.each([null, false, 0, ''])('rejects falsey persisted intent or receipt %# rather than treating corruption as absence', async (value) => {
    for (const name of ['intent.json', 'receipt.json']) {
      const f = fixture(); await f.store.capture(f.request, true);
      writeFileSync(recordPath(f.root, f.request.requestId, name), JSON.stringify(value)); const before = files(f.root);
      expect(() => f.store.inspect(f.request.requestId)).toThrow();
      await expect(f.store.capture(f.request, true)).rejects.toThrow(); expect(files(f.root)).toEqual(before); expect(f.fetch).toHaveBeenCalledOnce();
    }
  });

  it('blocks current clock reversal and a resealed receipt allegedly finished in the future', async () => {
    const f = fixture(); await f.store.capture(f.request, true); f.clock.at = '2026-09-05T11:59:59.999Z';
    expect(() => f.store.inspect(f.request.requestId)).toThrow('SAMSARA_CLOCK_REVERSED');
    f.clock.at = NOW; mutateRecord(recordPath(f.root, f.request.requestId, 'receipt.json'), (r) => { r.finishedAt = '2026-09-05T12:00:00.001Z'; });
    expect(() => f.store.inspect(f.request.requestId)).toThrow('SAMSARA_HISTORY_INVALID');
  });

  it('rejects alternate internally valid, rehashed acquisition bytes because the exact response receipt no longer matches', async () => {
    const f = fixture(); await f.store.capture(f.request, true); const original = responseAcquisition(f)!;
    const acquisitionId = original.request.manifest.acquisitionId;
    const acquisitionPath = join(f.root, 'acquisitions', `${byteDigest(Buffer.from(acquisitionId)).slice(7)}.json`);
    rmSync(acquisitionPath);
    const body = syntheticSamsaraGpsResponse(f.declaration.scope); body.data[0].gps[0].latitude = 40;
    const replaced = f.intake.capture(original.request.manifest, encodeLocalRecord(body), NOW).acquisition;
    expect(f.intake.inspect(acquisitionId)).toEqual(replaced); expect(replaced.digest).not.toBe(original.digest);
    const before = files(f.root); expect(() => f.store.inspect(f.request.requestId)).toThrow('SAMSARA_HISTORY_INVALID');
    expect(files(f.root)).toEqual(before); expect(f.fetch).toHaveBeenCalledOnce();
  });

  it('rejects an incomplete response acquisition allegedly captured after the current inspection clock', async () => {
    const f = fixture(); await f.store.capture(f.request, true); const original = responseAcquisition(f)!;
    rmSync(recordPath(f.root, f.request.requestId, 'receipt.json'));
    rmSync(join(f.root, 'acquisitions', `${byteDigest(Buffer.from(original.request.manifest.acquisitionId)).slice(7)}.json`));
    const future = '2026-09-05T12:01:00.000Z';
    f.intake.capture({ ...original.request.manifest, capturedAt: future }, encodeLocalRecord(syntheticSamsaraGpsResponse(f.declaration.scope)), future);
    const before = files(f.root); expect(() => f.store.inspect(f.request.requestId)).toThrow('SAMSARA_HISTORY_INVALID');
    expect(files(f.root)).toEqual(before); expect(f.fetch).toHaveBeenCalledOnce();
  });
});
