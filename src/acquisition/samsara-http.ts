import { lookup } from 'node:dns/promises';
import { request, type RequestOptions } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { isIPv4 } from 'node:net';

export const SAMSARA_HTTP_TIMEOUT_MS = 10_000;
export const SAMSARA_HTTP_MAX_BYTES = 256 * 1024;
export const SAMSARA_HISTORY_MAX_WINDOW_MS = 15 * 60 * 1000;
const MAX_HEADER_BYTES = 8192;
const HOSTS = { US: 'api.samsara.com', EU: 'api.eu.samsara.com', CA: 'api.ca.samsara.com' } as const;
const PATHNAME = '/fleet/vehicles/stats/history';
const QUERY_FIELDS = ['region', 'vehicleId', 'startTime', 'endTime'] as const;

export interface SamsaraHistoryQuery {
  region: 'US' | 'EU' | 'CA';
  vehicleId: string;
  startTime: string;
  endTime: string;
}

function fault(code: string): Error { return new Error(`SAMSARA_${code}`); }

function canonicalTime(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

/** Code-owned endpoint: one vehicle, GPS only, one bounded historical page, no cursor. */
export function buildSamsaraHistoryUrl(query: SamsaraHistoryQuery): URL {
  try {
    if (!query || typeof query !== 'object' || Array.isArray(query)
      || ![null, Object.prototype].includes(Object.getPrototypeOf(query))) throw fault('INVALID_QUERY');
    const keys = Reflect.ownKeys(query);
    if (keys.length !== QUERY_FIELDS.length || QUERY_FIELDS.some((key) => !keys.includes(key))) throw fault('INVALID_QUERY');
    const values: Record<string, unknown> = Object.create(null);
    for (const key of QUERY_FIELDS) {
      const descriptor = Object.getOwnPropertyDescriptor(query, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw fault('INVALID_QUERY');
      values[key] = descriptor.value;
    }
    const { region, vehicleId, startTime, endTime } = values;
    if (typeof region !== 'string' || !Object.hasOwn(HOSTS, region)
      || typeof vehicleId !== 'string' || !/^[1-9]\d{0,31}$/.test(vehicleId)
      || !canonicalTime(startTime) || !canonicalTime(endTime)) throw fault('INVALID_QUERY');
    const windowMs = Date.parse(endTime) - Date.parse(startTime);
    if (windowMs <= 0 || windowMs > SAMSARA_HISTORY_MAX_WINDOW_MS) throw fault('INVALID_QUERY');
    const url = new URL(`https://${HOSTS[region as keyof typeof HOSTS]}${PATHNAME}`);
    url.searchParams.set('types', 'gps');
    url.searchParams.set('vehicleIds', vehicleId);
    url.searchParams.set('startTime', startTime);
    url.searchParams.set('endTime', endTime);
    return url;
  } catch {
    // Includes rejected accessors/proxies; never expose caller-supplied values or diagnostics.
    throw fault('INVALID_QUERY');
  }
}

function isPublicV4(address: string): boolean {
  if (!isIPv4(address)) return false;
  const [a, b, c] = address.split('.').map(Number);
  // Conservatively exclude special-purpose ranges. IPv6 is not an implicit fallback.
  return !(a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && ((b === 0 && (c === 0 || c === 2)) || b === 168
      || (b === 88 && c === 99) || (b === 31 && c === 196)
      || (b === 52 && c === 193) || (b === 175 && c === 48)))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113));
}

/** No environment credential lookup, retries, redirects, cookies, or provider-header retention. */
export function fetchSamsaraHistoryBytes(query: SamsaraHistoryQuery, token: string): Promise<{ bytes: Buffer; mediaType: 'application/json' }> {
  let url: URL;
  try {
    url = buildSamsaraHistoryUrl(query);
    if (typeof token !== 'string' || token.length < 1 || token.length > 4096 || !/^[A-Za-z0-9._~-]+$/.test(token)) throw fault('INVALID_TOKEN');
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw fault('TLS_CONFIGURATION_DISALLOWED');
  } catch (error) { return Promise.reject(error); }

  return new Promise((resolve, reject) => {
    let settled = false;
    let outgoing: ClientRequest | undefined;
    let incoming: IncomingMessage | undefined;
    const deadline = setTimeout(() => fail(fault('TIMEOUT')), SAMSARA_HTTP_TIMEOUT_MS);
    function fail(error: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      reject(error);
      incoming?.destroy();
      outgoing?.destroy();
    }
    try {
      lookup(url.hostname, { all: true, family: 4, verbatim: true }).then((answers) => {
        if (settled) return;
        if (answers.length === 0 || answers.length > 32
          || answers.some((answer) => answer.family !== 4 || !isPublicV4(answer.address))) {
          fail(fault('DESTINATION_DISALLOWED')); return;
        }
        // Recheck immediately before sending an authorization-bearing request.
        if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') { fail(fault('TLS_CONFIGURATION_DISALLOWED')); return; }
        const address = answers[0].address;
        const options: RequestOptions & { autoSelectFamily: boolean } = {
          protocol: 'https:', hostname: url.hostname, servername: url.hostname, port: 443,
          path: `${url.pathname}${url.search}`, method: 'GET',
          agent: false, family: 4, autoSelectFamily: false, rejectUnauthorized: true,
          minVersion: 'TLSv1.2', maxHeaderSize: MAX_HEADER_BYTES,
          lookup: (_hostname, _options, callback) => callback(null, address, 4),
          headers: {
            Accept: 'application/json', 'Accept-Encoding': 'identity',
            'User-Agent': 'PayloadOS/0.1 bounded-authorized-history',
            Authorization: `Bearer ${token}`,
          },
        };
        try {
          outgoing = request(options, (response) => {
            incoming = response;
            response.on('error', () => fail(fault('NETWORK_FAILED')));
            if (settled) { response.destroy(); return; }
            response.on('aborted', () => fail(fault('NETWORK_FAILED')));
            response.on('close', () => { if (!settled) fail(fault('NETWORK_FAILED')); });
            const status = response.statusCode ?? 0;
            if (status >= 300 && status <= 399) { fail(fault('REDIRECT_DISALLOWED')); return; }
            if (status !== 200) {
              fail(fault(status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN'
                : status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR')); return;
            }
            const structuralHeaders = new Set(['content-type', 'content-length', 'content-encoding', 'transfer-encoding']);
            const seen = new Set<string>();
            for (let index = 0; index < response.rawHeaders.length; index += 2) {
              const name = response.rawHeaders[index].toLowerCase();
              if (structuralHeaders.has(name) && seen.has(name)) { fail(fault('INVALID_RESPONSE')); return; }
              seen.add(name);
            }
            const type = response.headers['content-type'];
            if (typeof type !== 'string' || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type)) {
              fail(fault('MEDIA_TYPE_UNSUPPORTED')); return;
            }
            const encoding = response.headers['content-encoding'];
            if (encoding !== undefined && (typeof encoding !== 'string' || encoding.toLowerCase() !== 'identity')) {
              fail(fault('ENCODING_UNSUPPORTED')); return;
            }
            const lengthHeader = response.headers['content-length'];
            const transferEncoding = response.headers['transfer-encoding'];
            if (transferEncoding !== undefined && (transferEncoding !== 'chunked' || lengthHeader !== undefined)) {
              fail(fault('INVALID_RESPONSE')); return;
            }
            let expectedLength: number | null = null;
            if (lengthHeader !== undefined) {
              if (typeof lengthHeader !== 'string' || !/^\d{1,16}$/.test(lengthHeader) || !Number.isSafeInteger(Number(lengthHeader))) {
                fail(fault('INVALID_RESPONSE')); return;
              }
              expectedLength = Number(lengthHeader);
              if (expectedLength > SAMSARA_HTTP_MAX_BYTES) { fail(fault('BODY_TOO_LARGE')); return; }
            }
            const chunks: Buffer[] = [];
            let size = 0;
            response.on('data', (chunk: Buffer) => {
              if (settled) return;
              if (!Buffer.isBuffer(chunk)) { fail(fault('INVALID_RESPONSE')); return; }
              size += chunk.length;
              if (size > SAMSARA_HTTP_MAX_BYTES) { fail(fault('BODY_TOO_LARGE')); return; }
              chunks.push(Buffer.from(chunk));
            });
            response.on('end', () => {
              if (settled) return;
              if (!response.complete || (expectedLength !== null && size !== expectedLength)) {
                fail(fault('INVALID_RESPONSE')); return;
              }
              settled = true;
              clearTimeout(deadline);
              resolve({ bytes: Buffer.concat(chunks, size), mediaType: 'application/json' });
            });
          });
          outgoing.on('error', () => fail(fault('NETWORK_FAILED')));
          if (settled) { outgoing.destroy(); return; }
          outgoing.end();
        } catch { fail(fault('NETWORK_FAILED')); }
      }, () => fail(fault('DNS_FAILED'))).catch(() => fail(fault('NETWORK_FAILED')));
    } catch { fail(fault('DNS_FAILED')); }
  });
}
