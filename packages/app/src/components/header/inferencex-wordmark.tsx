export function InferenceXWordmark() {
  return (
    <span
      data-testid="inferencex-wordmark"
      className="inferencex-wave-wordmark inline-block pr-1.5 text-lg font-bold tracking-tight"
      role="img"
      aria-label="InferenceX"
    >
      {[...'InferenceX'].map((letter, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="inferencex-wave-letter"
          style={{ animationDelay: `${index * -0.12}s` }}
        >
          {letter}
        </span>
      ))}
    </span>
  );
}
