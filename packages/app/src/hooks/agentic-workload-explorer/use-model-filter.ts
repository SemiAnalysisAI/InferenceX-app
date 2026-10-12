'use client';

import { useCallback, useEffect, useState } from 'react';
import { UNLISTED_MODEL } from '@semianalysisai/inferencex-db/proxytrace/shared/pricing';

export function useModelFilter() {
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/agentic-workload-explorer/models')
      .then((r) => r.json())
      // `other` groups unlisted models and cannot be filtered on (the API rejects it).
      .then((data: { tokensByModel: { model: string }[] }) =>
        setModels(
          [...new Set(data.tokensByModel.map((m) => m.model))]
            .filter((m) => m !== UNLISTED_MODEL)
            .toSorted(),
        ),
      )
      .catch(console.error);
  }, []);

  const buildUrl = useCallback(
    (base: string) => {
      if (!selectedModel) return base;
      const sep = base.includes('?') ? '&' : '?';
      return `${base}${sep}model=${encodeURIComponent(selectedModel)}`;
    },
    [selectedModel],
  );

  return { models, selectedModel, setSelectedModel, buildUrl };
}
