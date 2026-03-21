import Image from 'next/image';
import Link from 'next/link';

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

export const mdxComponents: Record<string, React.ComponentType<any>> = {
  a: CustomLink,
  img: CustomImage,
};
