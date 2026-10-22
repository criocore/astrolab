// A small JSON Schema validator for the subset used by prompts/*.schema.json:
// type, properties, required, additionalProperties:false, items, enum, const, minItems, maxItems, minLength, maxLength, pattern, minimum, maximum.
export function validate(schema: any, value: unknown, at = '$'): string[] {
  const errs: string[] = [];
  const fail = (m: string) => errs.push(`${at}: ${m}`);
  if (schema === true || schema === undefined) return errs;
  const t = schema.type;
  const is = (x: unknown): string => (x === null ? 'null' : Array.isArray(x) ? 'array' : Number.isInteger(x) ? 'integer' : typeof x);
  if (t) {
    const types: string[] = Array.isArray(t) ? t : [t];
    const got = is(value);
    if (!types.some((x) => x === got || (x === 'number' && got === 'integer'))) {
      fail(`type ${got}, expected ${types.join('|')}`);
      return errs;
    }
  }
  if (schema.enum && !schema.enum.some((e: unknown) => JSON.stringify(e) === JSON.stringify(value))) fail('not in enum');
  if ('const' in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) fail('not const');
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) fail('too short');
    if (schema.maxLength !== undefined && value.length > schema.maxLength) fail('too long');
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail('pattern');
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail('below minimum');
    if (schema.maximum !== undefined && value > schema.maximum) fail('above maximum');
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail('too few items');
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail('too many items');
    if (schema.items) value.forEach((v, i) => errs.push(...validate(schema.items, v, `${at}[${i}]`)));
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    const props = schema.properties ?? {};
    for (const k of schema.required ?? []) if (!(k in o)) fail(`missing ${k}`);
    if (schema.additionalProperties === false) for (const k of Object.keys(o)) if (!(k in props)) fail(`unexpected ${k}`);
    for (const k of Object.keys(props)) if (k in o) errs.push(...validate(props[k], o[k], `${at}.${k}`));
  }
  return errs;
}

export const isValid = (schema: unknown, value: unknown) => validate(schema, value).length === 0;
