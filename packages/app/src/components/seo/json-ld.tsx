// Inline JSON-LD <script>. Emits raw JSON via dangerouslySetInnerHTML (React
// children would HTML-escape the payload). Escapes `<`, `>`, and `&` per the
// HTML5 spec for `<script>` element contents — blocks `</script>` breakout and
// keeps the payload valid if any string field ever contains one of those.
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
