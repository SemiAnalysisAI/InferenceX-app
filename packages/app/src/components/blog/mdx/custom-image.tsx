import Image from 'next/image';

export function CustomImage(props: React.ImgHTMLAttributes<HTMLImageElement>) {
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
