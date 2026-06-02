'use client';

import { useEffect, useMemo, useRef } from 'react';

import { DISPLAY_MODEL_TO_DB, islOslToSequence } from '@semianalysisai/inferencex-constants';

import { type Model, type Sequence, MODEL_OPTIONS, SEQUENCE_OPTIONS } from '@/lib/data-mappings';
import { computeAutoSwitchDecision } from '@/lib/unofficial-run-auto-switch';
import type { AvailableModelSequence } from '@/components/unofficial-run-utils';
import type { UrlStateKey } from '@/lib/url-state';
import type { AvailabilityRow } from '@/lib/api';

/**
 * Derives model/sequence/precision/date availability from the shared
 * availability rows merged with the unofficial-run overlay, and auto-switches
 * the selected model when an unofficial run is loaded that lacks it.
 *
 * Extracted verbatim from GlobalFilterProvider — same memo deps, same effect
 * deps, same auto-switch ref guard. The provider keeps ownership of
 * selectedModel/selectedSequence/selectedPrecisions and passes them in.
 */
export function useDerivedAvailability(params: {
  availabilityRows: AvailabilityRow[] | undefined;
  unofficialAvailable: AvailableModelSequence[];
  selectedModel: Model;
  selectedSequence: Sequence;
  selectedPrecisions: string[];
  getUrlParam: (key: UrlStateKey) => string | undefined;
  setSelectedModel: (model: Model) => void;
}) {
  const {
    availabilityRows,
    unofficialAvailable,
    selectedModel,
    selectedSequence,
    selectedPrecisions,
    getUrlParam,
    setSelectedModel,
  } = params;

  const dbModelKeys = useMemo<string[]>(
    () => DISPLAY_MODEL_TO_DB[selectedModel] ?? [selectedModel],
    [selectedModel],
  );

  // Pre-filter availability rows by model once
  const modelRows = useMemo(
    () => availabilityRows?.filter((r) => dbModelKeys.includes(r.model)) ?? [],
    [availabilityRows, dbModelKeys],
  );

  // Models that have any data (DB ∪ unofficial run)
  const availableModels = useMemo(() => {
    if (!availabilityRows) return MODEL_OPTIONS;
    const unofficialModels = new Set(unofficialAvailable.map((a) => a.model));
    return MODEL_OPTIONS.filter((m) => {
      if (unofficialModels.has(m)) return true;
      const keys = DISPLAY_MODEL_TO_DB[m] ?? [m];
      return availabilityRows.some((r) => keys.includes(r.model));
    });
  }, [availabilityRows, unofficialAvailable]);

  // Auto-switch the selected model when an unofficial run is loaded that
  // doesn't include the currently selected model. Without this, navigating
  // to `?unofficialrun=<id>` while the default `g_model=DeepSeek-R1` sticks
  // leaves the user staring at a chart with no overlay points — they'd have
  // to know to open the dropdown and pick the run's model themselves.
  //
  // Precedence on first load: the `if (urlModel)` early-bail in
  // `computeAutoSwitchDecision` is the primary guard for explicit `g_model`
  // intent. The dedupe ref is a secondary guard for the narrow window after
  // an auto-switch fires but before the URL-sync effect (below) writes
  // `g_model` back to the URL — once that runs, `urlModel` is set on every
  // subsequent render and the ref check is effectively redundant. The ref
  // still matters across navigations between unofficial runs because it is
  // reset whenever the overlay set goes empty.
  const lastAutoSwitchKeyRef = useRef<string>('');
  useEffect(() => {
    const decision = computeAutoSwitchDecision(
      unofficialAvailable,
      getUrlParam('g_model'),
      selectedModel,
      lastAutoSwitchKeyRef.current,
    );
    lastAutoSwitchKeyRef.current = decision.nextKey;
    if (decision.modelToSet !== null) {
      setSelectedModel(decision.modelToSet);
    }
  }, [unofficialAvailable, selectedModel]);

  // Sequences available for the selected model (DB ∪ unofficial run for this model)
  const availableSequences = useMemo(() => {
    const unofficialSeqs = unofficialAvailable.flatMap((a) =>
      a.model === selectedModel ? [a.sequence as Sequence] : [],
    );
    if (!availabilityRows) {
      return unofficialSeqs.length > 0 ? [...new Set(unofficialSeqs)] : SEQUENCE_OPTIONS;
    }
    const dbSeqs = modelRows
      .map((r) => islOslToSequence(r.isl, r.osl))
      .filter((s): s is Sequence => s !== null);
    const merged = [...new Set([...dbSeqs, ...unofficialSeqs])];
    return merged.length > 0 ? merged : SEQUENCE_OPTIONS;
  }, [availabilityRows, modelRows, unofficialAvailable, selectedModel]);

  // Synchronously validated sequence
  const effectiveSequence = useMemo(() => {
    if (availableSequences.includes(selectedSequence)) return selectedSequence;
    return availableSequences[0] ?? selectedSequence;
  }, [availableSequences, selectedSequence]);

  // Precisions available for the selected model + sequence (DB ∪ unofficial run)
  const availablePrecisions = useMemo(() => {
    const unofficialPrecs = unofficialAvailable.flatMap((a) =>
      a.model === selectedModel && a.sequence === effectiveSequence ? a.precisions : [],
    );
    if (!availabilityRows) {
      return unofficialPrecs.length > 0 ? [...new Set(unofficialPrecs)].toSorted() : ['fp4'];
    }
    const rows = modelRows.filter((r) => islOslToSequence(r.isl, r.osl) === effectiveSequence);
    const dbPrecs = rows.map((r) => r.precision);
    const merged = [...new Set([...dbPrecs, ...unofficialPrecs])].toSorted();
    return merged.length > 0 ? merged : ['fp4'];
  }, [availabilityRows, modelRows, effectiveSequence, unofficialAvailable, selectedModel]);

  // Synchronously validated precisions
  const effectivePrecisions = useMemo(() => {
    const valid = selectedPrecisions.filter((p) => availablePrecisions.includes(p));
    if (valid.length > 0) return valid;
    return availablePrecisions.length > 0 ? [availablePrecisions[0]] : selectedPrecisions;
  }, [selectedPrecisions, availablePrecisions]);

  // Dates available for selected model + sequence + precisions
  const availableDates = useMemo(() => {
    if (!availabilityRows) return [];
    const seqRows = modelRows.filter((r) => islOslToSequence(r.isl, r.osl) === effectiveSequence);
    const rows = seqRows.filter((r) => effectivePrecisions.includes(r.precision));
    if (rows.length === 0) {
      return [...new Set(seqRows.map((r) => r.date))].toSorted();
    }
    return [...new Set(rows.map((r) => r.date))].toSorted();
  }, [availabilityRows, modelRows, effectiveSequence, effectivePrecisions]);

  return {
    availableModels,
    availableSequences,
    effectiveSequence,
    availablePrecisions,
    effectivePrecisions,
    availableDates,
  };
}
