const VARIANTS = [
  { id: 'v1', name: 'V1: Current — Plain dark' },
  { id: 'v2', name: 'V2: Circuit Corners — Teal blocks in corners' },
  { id: 'v3', name: 'V3: Grid Overlay — Full circuit grid behind content' },
  { id: 'v4', name: 'V4: Left Stripe — Circuit sidebar on left' },
  { id: 'v5', name: 'V5: Diagonal Blocks — Blocks along diagonal' },
  { id: 'v6', name: 'V6: Top Bar — Dense circuit header strip' },
  { id: 'v7', name: 'V7: Right Panel — Circuit panel on right 1/3' },
  { id: 'v8', name: 'V8: Bottom Circuit — Circuit footer with gold separator' },
  { id: 'v9', name: 'V9: Scattered Nodes — Organic constellation of nodes' },
  { id: 'v10', name: 'V10: Border Frame — Circuit blocks framing entire card' },
  { id: 'v11', name: 'V11: Brand Corners — SemiAnalysis palette, circuit corners, gold/blue/teal' },
  { id: 'v12', name: 'V12: Brand Grid — Full tiled circuit grid, exact sharecard style' },
  { id: 'v13', name: 'V13: Brand Left Panel — Circuit sidebar with blue accent bar, gold nodes' },
  {
    id: 'v14',
    name: 'V14: Brand Frame Gold — Circuit frame, gold L-brackets, semianalysis wordmark',
  },
  {
    id: 'v15',
    name: 'V15: Brand Split — Content top, circuit footer with gold divider + wordmark',
  },
  {
    id: 'v16',
    name: 'V16: Slide Title — Gold bg, dark text, circuit right panel (GSA title slide)',
  },
  {
    id: 'v17',
    name: 'V17: Slide Content — Charcoal bg, uppercase title, chart grid, gold bottom bar',
  },
  {
    id: 'v18',
    name: 'V18: Slide Hybrid — Gold left + charcoal right, two-tone presentation split',
  },
  {
    id: 'v19',
    name: 'V19: Slide Keynote — Gold title on charcoal, italic subtitle, gold footer bar',
  },
  {
    id: 'v20',
    name: 'V20: Slide Full — Gold top+bottom bars, circuit right panel, gold chart title',
  },
  { id: 'v21', name: 'V21: Compact Bold — Huge title, brand + date only, max readability' },
  { id: 'v22', name: 'V22: Gold Title Bar — Thick gold top bar, massive white title below' },
  { id: 'v23', name: 'V23: Bold Circuit — Few chunky circuit blocks, huge centered title' },
  {
    id: 'v24',
    name: 'V24: Gold Split Bold — Gold left panel, massive title right, no fine details',
  },
  { id: 'v25', name: 'V25: Gold Accent Stripe — Thick gold left stripe, massive title, minimal' },
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
