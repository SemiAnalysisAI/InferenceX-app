export function InferenceXWordmark() {
  return (
    <span
      data-testid="inferencex-wordmark"
      className="halloween-wordmark relative inline-block pr-2 text-lg font-bold tracking-normal"
    >
      Inference<span className="halloween-wordmark-x">X</span>
      <span
        aria-hidden="true"
        data-testid="wordmark-pumpkin"
        className="halloween-wordmark-pumpkin pointer-events-none absolute -right-1 -top-2 select-none text-base leading-none"
      >
        🎃
      </span>
    </span>
  );
}
