import type { ReactNode } from 'react';

import { JsonLd } from '@/components/json-ld';

import { childrenToText } from './children-to-text';

export function MdxJsonLd(props: { children?: ReactNode }) {
  const raw = childrenToText(props.children).trim();
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  return <JsonLd data={parsed} />;
}
