const FIGURE_TAG = /<Figure\b[\s\S]*?\/>/gu;
const SOURCE_ATTRIBUTE = /\b(?:src|srcLight|srcDark)="(?<src>[^"]+)"/gu;

/** Every image URL an MDX document passes to `<Figure src | srcLight | srcDark>`, in order. */
export function figureSources(mdx: string): string[] {
  return [...mdx.matchAll(FIGURE_TAG)].flatMap(([tag]) =>
    [...tag.matchAll(SOURCE_ATTRIBUTE)].map((match) => match.groups!.src),
  );
}
