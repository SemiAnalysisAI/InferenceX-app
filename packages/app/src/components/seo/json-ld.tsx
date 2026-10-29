export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data);
  if (!json) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: json
          .replaceAll('<', String.raw`\u003c`)
          .replaceAll('>', String.raw`\u003e`)
          .replaceAll('&', String.raw`\u0026`),
      }}
    />
  );
}
