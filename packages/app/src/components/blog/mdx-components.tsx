import { slugify } from '@/lib/blog';

import { Blur } from './mdx/blur';
import { childrenToText } from './mdx/children-to-text';
import { CustomImage } from './mdx/custom-image';
import { CustomLink } from './mdx/custom-link';
import { DashboardCTA } from './mdx/dashboard-cta';
import { Figure } from './mdx/figure';
import { MdxHeading } from './mdx/mdx-heading';
import { MdxJsonLd } from './mdx/mdx-json-ld';
import { TableWrapper } from './mdx/table-wrapper';

/** Creates a fresh set of MDX components with clean heading dedup state per render. */
export function createMdxComponents(): Record<string, React.ComponentType<any>> {
  const seen = new Set<string>();
  const parents: string[] = [];
  let figureCount = 0;

  function uniqueId(text: string, level: number): string {
    const base = slugify(text);
    parents[level] = base;
    let id = base;
    if (seen.has(id)) {
      const parent = parents.slice(1, level).findLast(Boolean);
      id = parent ? `${parent}-${base}` : `${base}-${level}`;
    }
    seen.add(id);
    return id;
  }

  return {
    h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <MdxHeading id={uniqueId(childrenToText(props.children), 1)} level={1} {...props} />
    ),
    h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <MdxHeading id={uniqueId(childrenToText(props.children), 2)} level={2} {...props} />
    ),
    h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
      <MdxHeading id={uniqueId(childrenToText(props.children), 3)} level={3} {...props} />
    ),
    a: CustomLink,
    img: CustomImage,
    Figure: (props: {
      src?: string;
      srcLight?: string;
      srcDark?: string;
      alt?: string;
      caption?: string;
    }) => {
      const loading = figureCount === 0 ? 'eager' : 'lazy';
      figureCount++;
      return <Figure {...props} loading={loading} />;
    },
    table: TableWrapper,
    Blur,
    DashboardCTA,
    JsonLd: MdxJsonLd,
  };
}
