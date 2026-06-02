import { HeadingLink } from '@/components/blog/heading-link';

/**
 * Rendered heading for MDX h1/h2/h3. The `id` is computed by the per-render
 * dedup state in `createMdxComponents`. h1 is intentionally rendered as an h2
 * (the post title is the only h1 on the page).
 */
export function MdxHeading({
  id,
  level,
  ...props
}: { id: string; level: 1 | 2 | 3 } & React.HTMLAttributes<HTMLHeadingElement>) {
  const Tag = level === 3 ? 'h3' : 'h2';
  return (
    <Tag id={id} className="group" {...props}>
      {props.children}
      <HeadingLink id={id} />
    </Tag>
  );
}
