import { createHash } from 'node:crypto';

/** Restricted canonical format v1; deliberately not general-purpose JCS. */
export function assertUnicode(value: string): void {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('INVALID_UNICODE');
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error('INVALID_UNICODE');
  }
}

export function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 64) throw new Error('INVALID_CANONICAL_VALUE');
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    assertUnicode(value);
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new Error('INVALID_CANONICAL_VALUE');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (Reflect.ownKeys(value).length !== value.length + 1 || Object.keys(value).length !== value.length ||
        Array.from({ length: value.length }, (_, index) => Object.getOwnPropertyDescriptor(value, String(index)))
          .some(descriptor => !descriptor || !descriptor.enumerable || !('value' in descriptor))) {
      throw new Error('INVALID_CANONICAL_VALUE');
    }
    return `[${value.map(item => canonicalJson(item, depth + 1)).join(',')}]`;
  }
  if (typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error('INVALID_CANONICAL_VALUE');
  }
  const object = value as Record<string, unknown>;
  if (Reflect.ownKeys(object).length !== Object.keys(object).length) throw new Error('INVALID_CANONICAL_VALUE');
  return `{${Object.keys(object).sort().map(key => {
    if (!/^[\x20-\x7e]+$/.test(key) || !Object.getOwnPropertyDescriptor(object, key)?.enumerable ||
        !('value' in Object.getOwnPropertyDescriptor(object, key)!)) throw new Error('INVALID_CANONICAL_VALUE');
    return `${JSON.stringify(key)}:${canonicalJson(object[key], depth + 1)}`;
  }).join(',')}}`;
}

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalHash(value: unknown): string { return sha256(canonicalJson(value)); }

export function decodeUtf8(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw new Error('INVALID_UTF8');
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  assertUnicode(text);
  return text;
}

/** JSON.parse alone loses duplicate keys, including escaped spellings. */
export function parseStrictJson(text: string): unknown {
  assertUnicode(text);
  let position = 0;
  const invalid = (): never => { throw new Error('INVALID_JSON'); };
  const space = () => { while (/[\x20\t\r\n]/.test(text[position] ?? '') && position < text.length) position++; };
  const string = (): string => {
    const start = position++;
    while (position < text.length) {
      const char = text[position++];
      if (char === '\\') { position++; continue; }
      if (char === '"') {
        let value: unknown;
        try { value = JSON.parse(text.slice(start, position)); } catch { return invalid(); }
        if (typeof value !== 'string') return invalid();
        assertUnicode(value);
        return value;
      }
    }
    return invalid();
  };
  const parse = (depth: number): unknown => {
    if (depth > 64) return invalid();
    space();
    if (text[position] === '"') return string();
    if (text[position] === '{') {
      position++; space();
      const result: Record<string, unknown> = Object.create(null);
      if (text[position] === '}') { position++; return result; }
      for (;;) {
        space();
        if (text[position] !== '"') return invalid();
        const key = string(); space();
        if (Object.hasOwn(result, key) || text[position++] !== ':') return invalid();
        result[key] = parse(depth + 1); space();
        const next = text[position++];
        if (next === '}') return result;
        if (next !== ',') return invalid();
      }
    }
    if (text[position] === '[') {
      position++; space();
      const result: unknown[] = [];
      if (text[position] === ']') { position++; return result; }
      for (;;) {
        result.push(parse(depth + 1)); space();
        const next = text[position++];
        if (next === ']') return result;
        if (next !== ',') return invalid();
      }
    }
    for (const [literal, value] of [['true', true], ['false', false], ['null', null]] as const) {
      if (text.startsWith(literal, position)) { position += literal.length; return value; }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(position));
    if (!number) return invalid();
    position += number[0].length;
    const result = Number(number[0]);
    if (!Number.isFinite(result)) return invalid();
    return result;
  };
  const result = parse(0); space();
  if (position !== text.length) return invalid();
  return result;
}

export function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SCHEMA');
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== keys.length || keys.some(key => !Object.hasOwn(object, key))) {
    throw new Error('INVALID_SCHEMA');
  }
  return object;
}
