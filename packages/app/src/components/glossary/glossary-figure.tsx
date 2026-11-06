import Image from 'next/image';

import { renderCaption } from '@/components/blog/mdx-components';
import type { GlossaryFigure as GlossaryFigureData } from '@/lib/content/glossary';

// Rendered width of the term page's main column (max-w-5xl card minus the 16rem aside and padding).
const FIGURE_SIZES = '(min-width: 1024px) 688px, calc(100vw - 4.5rem)';

export function GlossaryFigure({ figure }: { figure: GlossaryFigureData }) {
  return (
    <figure className="mt-8 flex max-w-3xl flex-col gap-3">
      {/* Small labels need the full-size file, so the image opens it. */}
      <a href={figure.src} target="_blank" rel="noopener noreferrer" className="block">
        <Image
          src={figure.src}
          alt={figure.alt}
          width={figure.width}
          height={figure.height}
          sizes={FIGURE_SIZES}
          className="h-auto w-full rounded-xl"
        />
      </a>
      <figcaption className="text-sm text-muted-foreground">
        {renderCaption(figure.caption)}
      </figcaption>
    </figure>
  );
}
