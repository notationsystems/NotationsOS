import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encodeLocalRecord, exactFields, localJson, localRecordDigest } from './local-record';

describe('local metadata encoding compatibility', () => {
  it('preserves the prior exact key order, Unicode, escaping, and negative-zero encoding', () => {
    const value = { z: -0, '\ue000': 'private', '😀': 'astral', a: [null, true, 'é\n"quoted"'], b: { z: 2, a: 1 } };
    const previousEncoding = '{"a":[null,true,"é\\n\\"quoted\\""],"b":{"a":1,"z":2},"z":0,"😀":"astral","\ue000":"private"}';
    expect(localJson(value)).toBe(previousEncoding);
    expect(encodeLocalRecord(value)).toEqual(Buffer.from(previousEncoding, 'utf8'));
    expect(localRecordDigest(value)).toBe(`sha256:${createHash('sha256').update(previousEncoding, 'utf8').digest('hex')}`);
    expect(localRecordDigest(Object.fromEntries(Object.entries(value).reverse()))).toBe(localRecordDigest(value));
  });

  it('preserves numeric spelling and array order', () => {
    expect(localJson([1e21, 1e-7, 0, -0, 2, 1])).toBe('[1e+21,1e-7,0,0,2,1]');
    expect(localRecordDigest([1, 2])).not.toBe(localRecordDigest([2, 1]));
  });

  it.each([
    { name: 'undefined', value: undefined }, { name: 'function', value: () => 1 },
    { name: 'symbol', value: Symbol('unsupported') }, { name: 'bigint', value: BigInt(1) },
    { name: 'NaN', value: NaN }, { name: 'positive infinity', value: Infinity },
    { name: 'negative infinity', value: -Infinity }, { name: 'date', value: new Date(0) },
    { name: 'map', value: new Map() }, { name: 'null-prototype object', value: Object.create(null) },
  ])('rejects unsupported $name values at top level and inside records', ({ value }) => {
    expect(() => localJson(value)).toThrow(/plain, finite JSON/);
    expect(() => encodeLocalRecord({ value })).toThrow(/plain, finite JSON/);
    expect(() => localRecordDigest([value])).toThrow(/plain, finite JSON/);
  });

  it('retains the existing depth-20 boundary and refuses cycles', () => {
    let allowed: unknown = 'leaf';
    for (let index = 0; index < 20; index += 1) allowed = { nested: allowed };
    expect(() => localJson(allowed)).not.toThrow();
    expect(() => localJson({ nested: allowed })).toThrow(/deeply nested/);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => localJson(cyclic)).toThrow(/deeply nested/);
  });

  it('bounds UTF-8 bytes and preserves the default 64 KiB limit', () => {
    expect(encodeLocalRecord('é', 4)).toEqual(Buffer.from('"é"'));
    expect(() => encodeLocalRecord('é', 3)).toThrow(/3 bytes/);
    expect(encodeLocalRecord('x'.repeat(64 * 1024 - 2))).toHaveLength(64 * 1024);
    expect(() => encodeLocalRecord('x'.repeat(64 * 1024 - 1))).toThrow('Intake metadata exceeds 64 KiB.');
    expect(() => localRecordDigest('é', 3)).toThrow(/3 bytes/);
  });

  it.each([0, -1, 1.5, Infinity, NaN])('refuses an invalid byte limit %s', (maxBytes) => {
    expect(() => encodeLocalRecord({}, maxBytes)).toThrow(/positive safe integer/);
  });

  it('keeps exact required and optional field checks', () => {
    expect(() => exactFields({ required: 1 }, ['required'], ['optional'])).not.toThrow();
    expect(() => exactFields({ required: 1, optional: 2 }, ['required'], ['optional'])).not.toThrow();
    expect(() => exactFields({}, ['required'])).toThrow(/Expected only/);
    expect(() => exactFields({ required: 1, unknown: 2 }, ['required'])).toThrow(/Expected only/);
    expect(() => exactFields([], [])).toThrow(/plain object/);
    expect(() => exactFields(null, [])).toThrow(/plain object/);
  });
});
