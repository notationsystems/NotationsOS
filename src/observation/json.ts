/** Strict UTF-8 JSON with duplicate object keys rejected, including escaped equivalents. */
export function parseReplayJson(bytes: Uint8Array, maximum: number): unknown {
  if (!bytes.byteLength || bytes.byteLength > maximum) throw new Error('REPLAY_JSON_SIZE');
  const json = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const value: unknown = JSON.parse(json);
  const stack: Array<{ kind: 'array' } | { kind: 'object'; keys: Set<string>; key: boolean }> = [];
  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (c === '{') stack.push({ kind: 'object', keys: new Set(), key: true });
    else if (c === '[') stack.push({ kind: 'array' });
    else if (c === '}' || c === ']') stack.pop();
    else if (c === ',') { const top = stack.at(-1); if (top?.kind === 'object') top.key = true; }
    else if (c === '"') {
      const start = i;
      for (i++; i < json.length; i++) {
        if (json[i] === '\\') i++;
        else if (json[i] === '"') break;
      }
      const top = stack.at(-1);
      if (top?.kind === 'object' && top.key) {
        const key = JSON.parse(json.slice(start, i + 1)) as string;
        if (top.keys.has(key)) throw new Error('REPLAY_DUPLICATE_JSON_KEY');
        top.keys.add(key); top.key = false;
      }
    }
  }
  return value;
}
