// Inline JSON-LD <script>. Emits raw JSON via dangerouslySetInnerHTML (React
// children would HTML-escape the payload); the `<` swap blocks `</script>`
// breakout if any string field ever contains one.
export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data);
  if (!json) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: json.replaceAll('<', String.raw`\u003c`),
      }}
    />
  );
}
