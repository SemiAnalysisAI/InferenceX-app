import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { slugify } from '@/lib/blog';

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

function Heading1(props: React.HTMLAttributes<HTMLHeadingElement>) {
  const id = slugify(childrenToText(props.children));
  return <h2 id={id} {...props} />;
}

function Heading2(props: React.HTMLAttributes<HTMLHeadingElement>) {
  const id = slugify(childrenToText(props.children));
  return <h2 id={id} {...props} />;
}

function Heading3(props: React.HTMLAttributes<HTMLHeadingElement>) {
  const id = slugify(childrenToText(props.children));
  return <h3 id={id} {...props} />;
}

function Figure(props: { src: string; alt?: string; caption?: string }) {
  return (
    <figure className="my-6 flex flex-col items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={props.src} alt={props.alt ?? ''} className="rounded-lg w-full md:w-3/4" />
      {props.caption && (
        <figcaption className="text-center text-sm text-muted-foreground mt-2">
          {props.caption}
        </figcaption>
      )}
    </figure>
  );
}

function Blur(props: { children?: ReactNode }) {
  return <div className="blur-sm select-none pointer-events-none">{props.children}</div>;
}

export const mdxComponents: Record<string, React.ComponentType<any>> = {
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  a: CustomLink,
  img: CustomImage,
  Figure,
  Blur,
};
