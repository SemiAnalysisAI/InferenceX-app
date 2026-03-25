export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://substack-post-media.s3.amazonaws.com" />
      <link rel="dns-prefetch" href="https://substack-post-media.s3.amazonaws.com" />
      {children}
    </>
  );
}
