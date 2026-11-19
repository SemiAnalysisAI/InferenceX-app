import Image from 'next/image';

import { renderCaption } from '@/components/blog/mdx-components';
import type { GlossaryFigure as GlossaryFigureData } from '@/lib/content/glossary';

// Rendered width of the term page's main column, which is the 45rem reading measure.
const COLUMN_WIDTH = 720;

export function GlossaryFigure({ figure }: { figure: GlossaryFigureData }) {
  // Growing each image by its aspect ratio gives every image in the row the same height.
  const totalAspect = figure.images.reduce((sum, image) => sum + image.width / image.height, 0);
  return (
    <figure className="mt-8 flex max-w-measure flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        {figure.images.map((image) => {
          const aspect = image.width / image.height;
          const share = Math.round((COLUMN_WIDTH * aspect) / totalAspect);
          return (
            // Small labels need the full-size file, so each image opens it.
            <a
              key={image.src}
              href={image.src}
              target="_blank"
              rel="noopener noreferrer"
              className="block min-w-0"
              style={{ flex: `${aspect} 1 0%` }}
            >
              <Image
                src={image.src}
                alt={image.alt}
                width={image.width}
                height={image.height}
                sizes={`(min-width: 1024px) ${share}px, (min-width: 640px) ${Math.round((100 * aspect) / totalAspect)}vw, 100vw`}
                className="h-auto w-full rounded-xl"
              />
            </a>
          );
        })}
      </div>
      <figcaption className="text-sm text-muted-foreground">
        {renderCaption(figure.caption)}
      </figcaption>
    </figure>
  );
}
