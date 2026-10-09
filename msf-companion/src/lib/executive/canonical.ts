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
  // Serialize only detached data. Descriptor validation followed by ordinary
  // caller reads can execute Proxy traps or an Array subclass's map method and
  // hash values different from the ones that were validated.
  const captured = captureCanonicalValue(value, depth);
  const serialize = (item: unknown): string => {
    if (item === null || typeof item !== 'object') return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(serialize).join(',')}]`;
    const object = item as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(key =>
      `${JSON.stringify(key)}:${serialize(object[key])}`).join(',')}}`;
  };
  return serialize(captured);
}

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalHash(value: unknown): string { return sha256(canonicalJson(value)); }

/** Capture canonical data without executing getters or discarding hidden fields. */
export function captureCanonicalValue(value: unknown, depth = 0): unknown {
  if (depth > 64) throw new Error('INVALID_CANONICAL_VALUE');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') { assertUnicode(value); return value; }
  if (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0)) return value;
  if (!value || typeof value !== 'object') throw new Error('INVALID_CANONICAL_VALUE');
  try {
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : ![Object.prototype, null].includes(prototype)) {
      throw new Error('INVALID_CANONICAL_VALUE');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const captured: Record<string, unknown> | unknown[] = array ? [] : {};
    if (array) {
      const length = descriptors.length?.value;
      if (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1) throw new Error('INVALID_CANONICAL_VALUE');
      for (let index = 0; index < length; index++) {
        const descriptor = descriptors[String(index)];
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('INVALID_CANONICAL_VALUE');
        (captured as unknown[]).push(captureCanonicalValue(descriptor.value, depth + 1));
      }
    } else {
      for (const key of keys) {
        if (typeof key !== 'string' || !/^[\x20-\x7e]+$/.test(key)) throw new Error('INVALID_CANONICAL_VALUE');
        const descriptor = Object.getOwnPropertyDescriptor(descriptors, key)?.value as PropertyDescriptor | undefined;
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('INVALID_CANONICAL_VALUE');
        Object.defineProperty(captured, key, { value: captureCanonicalValue(descriptor.value, depth + 1),
          enumerable: true, writable: true, configurable: true });
      }
    }
    return captured;
  } catch {
    throw new Error('INVALID_CANONICAL_VALUE');
  }
}

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
  // Capture own data once: validating getters and then rereading/spreading the
  // caller can change a guarded target between validation and driver creation.
  // JSON objects have plain/null prototypes and no hidden or executable fields.
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('INVALID_SCHEMA');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== keys.length || new Set(keys).size !== keys.length) {
      throw new Error('INVALID_SCHEMA');
    }
    const captured: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(descriptors, key)?.value as PropertyDescriptor | undefined;
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('INVALID_SCHEMA');
      captured[key] = descriptor.value;
    }
    return captured;
  } catch {
    // Reflection on a revoked/opaque proxy must fail with the same bounded code.
    throw new Error('INVALID_SCHEMA');
  }
}
