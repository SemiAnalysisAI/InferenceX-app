import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { slugify } from '@/lib/blog';
import { HeadingLink } from '@/components/blog/heading-link';
import { JsonLd } from '@/components/json-ld';

function childrenToText(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(childrenToText).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return childrenToText((children as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

function CustomLink(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { href, children, ...rest } = props;
  if (href?.startsWith('/')) {
    return (
      <Link href={href} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  );
}

function CustomImage(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const { src, alt, width, height } = props;
  if (!src || typeof src !== 'string') return null;
  return (
    <Image
      src={src}
      alt={alt ?? ''}
      width={Number(width) || 800}
      height={Number(height) || 450}
      className="rounded-lg"
    />
  );
}

function Blur(props: { children?: ReactNode }) {
  return <div className="blur-sm select-none pointer-events-none">{props.children}</div>;
}

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
    h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => {
      const id = uniqueId(childrenToText(props.children), 1);
      return (
        <h2 id={id} className="group" {...props}>
          {props.children}
          <HeadingLink id={id} />
        </h2>
      );
    },
    h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => {
      const id = uniqueId(childrenToText(props.children), 2);
      return (
        <h2 id={id} className="group" {...props}>
          {props.children}
          <HeadingLink id={id} />
        </h2>
      );
    },
    h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => {
      const id = uniqueId(childrenToText(props.children), 3);
      return (
        <h3 id={id} className="group" {...props}>
          {props.children}
          <HeadingLink id={id} />
        </h3>
      );
    },
    a: CustomLink,
    img: CustomImage,
    Figure: (props: {
      src?: string;
      srcLight?: string;
      srcDark?: string;
      alt?: string;
      caption?: string;
    }) => {
      const isFirst = figureCount === 0;
      figureCount++;
      const loading = isFirst ? 'eager' : 'lazy';
      const lightSrc = props.srcLight ?? props.src;
      const darkSrc = props.srcDark ?? props.src;
      const hasThemedVariants = Boolean(props.srcLight || props.srcDark) && lightSrc !== darkSrc;
      return (
        <figure className="my-6 flex flex-col items-center">
          {hasThemedVariants ? (
            <>
              {lightSrc && (
                <img
                  src={lightSrc}
                  alt={props.alt ?? ''}
                  loading={loading}
                  decoding="async"
                  className="rounded-lg w-full md:w-3/4 block dark:hidden"
                />
              )}
              {darkSrc && (
                <img
                  src={darkSrc}
                  alt={props.alt ?? ''}
                  loading={loading}
                  decoding="async"
                  className="rounded-lg w-full md:w-3/4 hidden dark:block"
                />
              )}
            </>
          ) : (
            (lightSrc || darkSrc) && (
              <img
                src={lightSrc ?? darkSrc}
                alt={props.alt ?? ''}
                loading={loading}
                decoding="async"
                className="rounded-lg w-full md:w-3/4"
              />
            )
          )}
          {props.caption && (
            <figcaption className="text-center text-sm text-muted-foreground mt-2">
              {props.caption}
            </figcaption>
          )}
        </figure>
      );
    },
    table: (props: React.TableHTMLAttributes<HTMLTableElement>) => (
      <div className="table-scroll">
        <table {...props} />
      </div>
    ),
    Blur,
    DashboardCTA: (props: { href?: string; children?: ReactNode }) => {
      const href = props.href ?? 'https://inferencex.semianalysis.com';
      return (
        <div className="my-6 flex justify-center">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-0 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-brand/90"
          >
            {props.children ?? 'See full InferenceX Dashboard'}
          </a>
        </div>
      );
    },
    JsonLd: (props: { children?: ReactNode }) => {
      const raw = childrenToText(props.children).trim();
      if (!raw) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
      if (!parsed || typeof parsed !== 'object') return null;
      return <JsonLd data={parsed} />;
    },
  };
}
