'use client';

import { useEffect, useLayoutEffect } from 'react';

import type { UrlStateKey } from '@/lib/url-state';
import { Model, PRECISION_OPTIONS, Sequence } from '@/lib/data-mappings';

// useLayoutEffect warns during SSR; alias to useEffect on the server (no-op there anyway).
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function isEnumValue<T extends Record<string, string>>(e: T, v: string): v is T[keyof T] {
  return (Object.values(e) as string[]).includes(v);
}

const RUNDATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const RUNID_RE = /^[A-Za-z0-9_-]{1,64}$/u;

/**
 * Applies URL param overrides synchronously after the first commit. Runs only
 * on the client (useEffect on server is a no-op). Updates state before paint
 * so users with shareable URLs (?i_seq=…&g_model=…) see their values without
 * flicker, and SSR/client hydration agree because initial state came from
 * props/defaults on both sides.
 *
 * Extracted verbatim from GlobalFilterProvider (mount-only effect, empty deps).
 */
export function useGlobalUrlInit(params: {
  getUrlParam: (key: UrlStateKey) => string | undefined;
  setSelectedModel: (v: Model) => void;
  setSelectedSequence: (v: Sequence) => void;
  setSelectedPrecisionsRaw: (v: string[]) => void;
  setSelectedRunDateBase: (v: string) => void;
  setSelectedRunId: (v: string) => void;
}) {
  const {
    getUrlParam,
    setSelectedModel,
    setSelectedSequence,
    setSelectedPrecisionsRaw,
    setSelectedRunDateBase,
    setSelectedRunId,
  } = params;

  useIsomorphicLayoutEffect(() => {
    const applyIfEnum = <T extends Record<string, string>>(
      key: 'g_model' | 'i_seq',
      enumType: T,
      apply: (v: T[keyof T]) => void,
    ) => {
      const value = getUrlParam(key);
      if (value !== undefined && isEnumValue(enumType, value)) apply(value);
    };
    const applyIfMatches = (
      key: 'g_rundate' | 'g_runid',
      pattern: RegExp,
      apply: (v: string) => void,
    ) => {
      const value = getUrlParam(key);
      if (value !== undefined && pattern.test(value)) apply(value);
    };

    applyIfEnum('g_model', Model, setSelectedModel);
    applyIfEnum('i_seq', Sequence, setSelectedSequence);
    const urlPrec = getUrlParam('i_prec');
    if (urlPrec) {
      const precs = urlPrec
        .split(',')
        .filter((p) => (PRECISION_OPTIONS as readonly string[]).includes(p));
      if (precs.length > 0) setSelectedPrecisionsRaw(precs);
    }
    applyIfMatches('g_rundate', RUNDATE_RE, setSelectedRunDateBase);
    applyIfMatches('g_runid', RUNID_RE, setSelectedRunId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
