import type { ApiParameter, ApiSchema, BilingualText } from './api-documentation';

// Shared value constructors must not import the registry at runtime.
export const text = (en: string, zh: string): BilingualText => ({ en, zh });

export const stringSchema: ApiSchema = { type: 'string' };
export const numberSchema: ApiSchema = { type: 'number' };
export const integerSchema: ApiSchema = { type: 'integer' };
export const booleanSchema: ApiSchema = { type: 'boolean' };
export const nullableStringSchema: ApiSchema = { type: ['string', 'null'] };
export const nullableNumberSchema: ApiSchema = { type: ['number', 'null'] };
export const errorSchema: ApiSchema = {
  type: 'object',
  properties: { error: stringSchema },
  required: ['error'],
  additionalProperties: true,
};

export const objectSchema = (
  properties: Readonly<Record<string, ApiSchema>>,
  required: readonly string[] = Object.keys(properties),
): ApiSchema => ({ type: 'object', properties, required, additionalProperties: false });

export const arraySchema = (items: ApiSchema): ApiSchema => ({ type: 'array', items });

export const queryParameter = (
  name: string,
  required: boolean,
  type: string,
  en: string,
  zh: string,
  schema: ApiSchema,
  example: boolean | number | string,
): ApiParameter => ({
  name,
  location: 'query',
  required,
  type,
  description: text(en, zh),
  schema,
  example,
});

export const parameterErrorSchema: ApiSchema = {
  type: 'object',
  properties: { error: { type: 'string' }, param: { type: 'string' } },
  required: ['error'],
  additionalProperties: true,
};

export const listParam = (
  name: string,
  description: BilingualText,
  example: string,
  enumValues?: readonly string[],
): ApiParameter => ({
  name,
  location: 'query',
  required: false,
  type: 'string',
  description,
  schema: enumValues
    ? { type: 'string', enum: enumValues, description: 'Comma-separated list' }
    : { type: 'string', description: 'Comma-separated list' },
  example,
});
