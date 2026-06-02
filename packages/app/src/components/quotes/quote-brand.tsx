export function highlightBrand(text: string) {
  const parts = text.split(/(InferenceMAX™?|InferenceX™?|InferenceMAX|InferenceX)/giu);
  return parts.map((part, i) =>
    /^inference(max|x)/iu.test(part) ? (
      <span key={`${part}-${i}`} className="text-brand font-semibold">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
