export function InferenceXWordmark() {
  return (
    <span
      data-testid="inferencex-wordmark"
      className="thanksgiving-wordmark relative inline-block pr-1.5 text-lg font-bold tracking-tight"
    >
      Inference<span className="thanksgiving-wordmark-x">X</span>
      <span
        aria-hidden="true"
        data-testid="wordmark-turkey"
        className="thanksgiving-wordmark-turkey pointer-events-none absolute -right-1 -top-2 select-none text-base leading-none"
      >
        🦃
      </span>
    </span>
  );
}
