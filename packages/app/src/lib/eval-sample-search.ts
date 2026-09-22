/** The drawer searches only its current page, not the whole evaluation. */
export function filterEvalSamplePage<
  T extends {
    prompt: string | null;
    response: string | null;
    target: string | null;
  },
>(samples: T[], search: string): T[] {
  const q = search.trim().toLowerCase();
  return q
    ? samples.filter((sample) =>
        [sample.prompt, sample.response, sample.target].some((value) =>
          value?.toLowerCase().includes(q),
        ),
      )
    : samples;
}
