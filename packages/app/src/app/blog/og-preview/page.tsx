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
];

export default function OgPreviewPage() {
  return (
    <main className="container mx-auto px-4 py-12 max-w-5xl">
      <h1 className="text-3xl font-bold mb-2">OG Image Variants Preview</h1>
      <p className="text-muted-foreground mb-8">
        All 15 variants rendered with the &quot;Hello World&quot; post data. V11–V15 use the exact
        SemiAnalysis brand palette. Pick your favorite.
      </p>
      <div className="flex flex-col gap-10">
        {VARIANTS.map((v) => (
          <div key={v.id} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{v.name}</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/og-preview?slug=hello-world&v=${v.id}`}
              alt={v.name}
              width={1200}
              height={630}
              className="w-full rounded-lg border border-border"
            />
          </div>
        ))}
      </div>
    </main>
  );
}
