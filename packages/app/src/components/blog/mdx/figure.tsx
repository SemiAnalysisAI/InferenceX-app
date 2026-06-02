export function Figure(props: {
  src?: string;
  srcLight?: string;
  srcDark?: string;
  alt?: string;
  caption?: string;
  /** Computed by createMdxComponents: the first figure on the page loads eagerly. */
  loading?: 'eager' | 'lazy';
}) {
  const loading = props.loading ?? 'lazy';
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
}
