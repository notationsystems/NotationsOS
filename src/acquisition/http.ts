import { lookup } from 'node:dns/promises';
import { request, type RequestOptions } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { isIPv4 } from 'node:net';
import { SourceConnectorError } from './errors';

export const SOURCE_HTTP_TIMEOUT_MS = 10_000;
export const SOURCE_HTTP_MAX_BYTES = 256 * 1024;
const SOURCE_HTTP_MAX_HEADER_BYTES = 8192;
const HOSTNAME = 'data.transportation.gov';
const PATHNAME = '/resource/az4n-8mr2.json';
const QUERY_LIMITS = { '$select': 1024, '$where': 1024, '$order': 256, '$limit': 2 } as const;

export interface SourceBytes {
  bytes: Buffer;
  mediaType: string;
  lastModified: string | null;
  etag: string | null;
}

function fault(code: string, message: string, status = 502) {
  return new SourceConnectorError(code, message, status);
}

function validateUrl(input: URL): URL {
  if (!(input instanceof URL)) throw fault('SOURCE_URL_DISALLOWED', 'The source URL is not permitted.', 400);
  // Snapshot the URL before any asynchronous work; caller mutation must not change the target.
  const url = new URL(input.href);
  if (url.href.length > 4096 || url.protocol !== 'https:' || url.hostname !== HOSTNAME
    || url.pathname !== PATHNAME || url.username || url.password || url.hash || (url.port && url.port !== '443')) {
    throw fault('SOURCE_URL_DISALLOWED', 'The source URL is not permitted.', 400);
  }
  const entries = [...url.searchParams];
  if (entries.length !== 4 || new Set(entries.map(([key]) => key)).size !== 4
    || entries.some(([key, value]) => !Object.hasOwn(QUERY_LIMITS, key)
      || !value.trim() || /[^\x20-\x7e]/.test(value)
      || value.length > QUERY_LIMITS[key as keyof typeof QUERY_LIMITS])) {
    throw fault('SOURCE_URL_DISALLOWED', 'The source query is not permitted.', 400);
  }
  const limit = url.searchParams.get('$limit')!;
  if (!/^[1-9]\d?$/.test(limit) || Number(limit) > 25) {
    throw fault('SOURCE_URL_DISALLOWED', 'The source query limit is not permitted.', 400);
  }
  return url;
}

function isPublicV4(address: string): boolean {
  if (!isIPv4(address)) return false;
  const [a, b, c] = address.split('.').map(Number);
  // Conservatively exclude special-purpose networks, including globally reachable special ranges.
  // IPv6 is deliberately unsupported by this first transport, not silently allowed or retried.
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

function safeEtag(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
    && !/[^\x20-\x7e]/.test(value) ? value : null;
}

function safeLastModified(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string'
    || !/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toUTCString() === value ? value : null;
}

/** One bounded, authenticated-TLS request to the code-owned FMCSA endpoint; never retries. */
export function fetchSourceBytes(input: URL): Promise<SourceBytes> {
  let url: URL;
  try { url = validateUrl(input); } catch (error) { return Promise.reject(error); }
  return new Promise((resolve, reject) => {
    let settled = false;
    let outgoing: ClientRequest | undefined;
    let incoming: IncomingMessage | undefined;
    const deadline = setTimeout(() => fail(fault('SOURCE_TIMEOUT', 'The source request exceeded its total deadline.', 504)), SOURCE_HTTP_TIMEOUT_MS);
    function fail(error: SourceConnectorError) {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      // Do not propagate URLs, response bodies, cookies, credentials, or network diagnostics.
      reject(error);
      incoming?.destroy();
      outgoing?.destroy();
    }
    lookup(HOSTNAME, { all: true, family: 4, verbatim: true }).then((answers) => {
      if (settled) return;
      if (answers.length === 0 || answers.length > 32
        || answers.some((answer) => answer.family !== 4 || !isPublicV4(answer.address))) {
        fail(fault('SOURCE_DESTINATION_DISALLOWED', 'The source did not resolve exclusively to permitted public IPv4 addresses.'));
        return;
      }
      const address = answers[0].address;
      const options: RequestOptions & { autoSelectFamily: boolean } = {
        protocol: 'https:', hostname: HOSTNAME, servername: HOSTNAME, port: 443,
        path: `${url.pathname}${url.search}`, method: 'GET',
        agent: false, family: 4, autoSelectFamily: false, rejectUnauthorized: true,
        maxHeaderSize: SOURCE_HTTP_MAX_HEADER_BYTES,
        // Pin this connection to the address already checked, retaining the original TLS identity.
        lookup: (_hostname, _options, callback) => callback(null, address, 4),
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'identity',
          'User-Agent': 'PayloadOS/0.1 local-source-qualification',
        },
      };
      try {
        outgoing = request(options, (response) => {
          incoming = response;
          if (settled) { response.destroy(); return; }
          response.on('error', () => fail(fault('SOURCE_NETWORK_FAILED', 'The source response could not be read.')));
          response.on('aborted', () => fail(fault('SOURCE_NETWORK_FAILED', 'The source response ended prematurely.')));
          response.on('close', () => {
            if (!settled) fail(fault('SOURCE_NETWORK_FAILED', 'The source response ended prematurely.'));
          });
          const status = response.statusCode ?? 0;
          if (status >= 300 && status <= 399) {
            fail(fault('SOURCE_REDIRECT_DISALLOWED', 'Source redirects are not permitted.')); return;
          }
          if (status !== 200) {
            fail(status === 429
              ? fault('RATE_LIMITED', 'The source rate limit was reached; no automatic retry was attempted.', 429)
              : fault('SOURCE_HTTP_ERROR', 'The source did not return an accepted HTTP status.'));
            return;
          }
          const structuralHeaders = new Set(['content-type', 'content-length', 'content-encoding']);
          const seen = new Set<string>();
          for (let index = 0; index < response.rawHeaders.length; index += 2) {
            const name = response.rawHeaders[index].toLowerCase();
            if (structuralHeaders.has(name) && seen.has(name)) {
              fail(fault('SOURCE_INVALID_RESPONSE', 'The source response headers were ambiguous.')); return;
            }
            seen.add(name);
          }
          const type = response.headers['content-type'];
          if (typeof type !== 'string' || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type)) {
            fail(fault('SOURCE_MEDIA_TYPE_UNSUPPORTED', 'The source response is not supported JSON.')); return;
          }
          const encoding = response.headers['content-encoding'];
          if (encoding !== undefined && (typeof encoding !== 'string' || encoding.toLowerCase() !== 'identity')) {
            fail(fault('SOURCE_ENCODING_UNSUPPORTED', 'Encoded source responses are not permitted.')); return;
          }
          const lengthHeader = response.headers['content-length'];
          let expectedLength: number | null = null;
          if (lengthHeader !== undefined) {
            if (typeof lengthHeader !== 'string' || !/^\d+$/.test(lengthHeader) || !Number.isSafeInteger(Number(lengthHeader))) {
              fail(fault('SOURCE_INVALID_RESPONSE', 'The source content length is invalid.')); return;
            }
            expectedLength = Number(lengthHeader);
            if (expectedLength > SOURCE_HTTP_MAX_BYTES) {
              fail(fault('SOURCE_BODY_TOO_LARGE', 'The source response exceeds the byte limit.')); return;
            }
          }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on('data', (chunk: Buffer) => {
            if (settled) return;
            if (!Buffer.isBuffer(chunk)) {
              fail(fault('SOURCE_INVALID_RESPONSE', 'The source response is not a byte stream.')); return;
            }
            size += chunk.length;
            if (size > SOURCE_HTTP_MAX_BYTES) {
              fail(fault('SOURCE_BODY_TOO_LARGE', 'The source response exceeds the byte limit.')); return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => {
            if (settled) return;
            if (!response.complete || (expectedLength !== null && size !== expectedLength)) {
              fail(fault('SOURCE_INVALID_RESPONSE', 'The source response length is incomplete.')); return;
            }
            settled = true;
            clearTimeout(deadline);
            resolve({
              bytes: Buffer.concat(chunks, size), mediaType: 'application/json',
              lastModified: safeLastModified(response.headers['last-modified']),
              etag: safeEtag(response.headers.etag),
            });
          });
        });
        outgoing.on('error', () => fail(fault('SOURCE_NETWORK_FAILED', 'The source connection failed.')));
        outgoing.end();
      } catch {
        fail(fault('SOURCE_NETWORK_FAILED', 'The source connection failed.'));
      }
    }, () => fail(fault('SOURCE_DNS_FAILED', 'The source hostname could not be resolved.')));
  });
}
