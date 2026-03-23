const VARIANTS = [
  { id: 'v11', name: 'V11: Brand Corners — SemiAnalysis palette, circuit corners, gold/blue/teal' },
  { id: 'v12', name: 'V12: Brand Grid — Full tiled circuit grid, exact sharecard style' },
  { id: 'v13', name: 'V13: Brand Left Panel — Circuit sidebar with blue accent bar, gold nodes' },
  {
    id: 'v15',
    name: 'V15: Brand Split — Content top, circuit footer with gold divider + wordmark',
  },
];

function OgImg({ v, w, label }: { v: string; w: number; label: string }) {
  const h = Math.round(w * (630 / 1200));
  return (
    <div style={{ width: w, flexShrink: 0 }}>
      <span className="text-xs text-muted-foreground block mb-1">{label}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/og-preview?slug=hello-world&v=${v}`}
        alt={`${v} at ${w}px`}
        width={w}
        height={h}
        loading="lazy"
        style={{ display: 'block', width: w, height: h }}
        className="rounded border border-border"
      />
    </div>
  );
}

export default function OgPreviewPage() {
  return (
    <main className="container mx-auto px-4 py-12 max-w-5xl">
      <h1 className="text-3xl font-bold mb-2">OG Image Variants Preview</h1>
      <p className="text-muted-foreground mb-10">
        Each variant at full size, then at Twitter, Slack, and iMessage render sizes.
      </p>
      <div className="flex flex-col gap-12">
        {VARIANTS.map((v) => (
          <div key={v.id} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{v.name}</h2>
            {/* Full width */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/og-preview?slug=hello-world&v=${v.id}`}
              alt={`${v.name} full`}
              width={1200}
              height={630}
              loading="lazy"
              className="w-full rounded border border-border"
            />
            {/* Platform thumbnails */}
            <div className="flex gap-4 items-start overflow-x-auto">
              <OgImg v={v.id} w={500} label="Twitter/X" />
              <OgImg v={v.id} w={360} label="Slack" />
              <OgImg v={v.id} w={300} label="iMessage" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
