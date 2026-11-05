let selectedModel: string | undefined;
const listeners = new Set<() => void>();

export function getInferenceNavigationModel(): string | undefined {
  return selectedModel;
}

export function setInferenceNavigationModel(model: string | undefined): void {
  if (selectedModel === model) return;
  selectedModel = model;
  for (const listener of listeners) listener();
}

export function subscribeInferenceNavigationModel(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
