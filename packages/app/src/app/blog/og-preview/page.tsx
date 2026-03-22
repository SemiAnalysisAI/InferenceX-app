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
  { id: 'v26', name: 'V26: Halftone Dots — Dots decrease in size from corner to corner' },
  { id: 'v27', name: 'V27: Dot Grid — Uniform dot grid background' },
  { id: 'v28', name: 'V28: Constellation — Connected dots like a star map' },
  { id: 'v29', name: 'V29: Particle Burst — Dots radiating from bottom-left' },
  { id: 'v30', name: 'V30: Dot Border — Dots forming a dotted frame' },
  { id: 'v31', name: 'V31: Concentric Rings — Large circles centered right, partially off-screen' },
  { id: 'v32', name: 'V32: Venn Overlap — 3 translucent circles overlapping' },
  { id: 'v33', name: 'V33: Floating Bubbles — Various sized circles scattered' },
  { id: 'v34', name: 'V34: Ripple Waves — Quarter-circles from bottom-left' },
  { id: 'v35', name: 'V35: Corner Arcs — Quarter-circle arcs in each corner' },
  { id: 'v36', name: 'V36: Scan Lines — CRT/retro horizontal scan lines' },
  { id: 'v37', name: 'V37: Vertical Blinds — Alternating vertical bars' },
  { id: 'v38', name: 'V38: Crosshatch — Diagonal crossing line segments' },
  { id: 'v39', name: 'V39: Sound Wave — Audio waveform/equalizer bars' },
  { id: 'v40', name: 'V40: Radial Rays — Lines radiating from bottom center' },
  { id: 'v41', name: 'V41: Isometric Grid — Diamond shapes in isometric pattern' },
  { id: 'v42', name: 'V42: Blueprint — Blue grid on dark navy, engineering feel' },
  { id: 'v43', name: 'V43: Glitch Grid — Interrupted/offset grid lines, digital glitch' },
  { id: 'v44', name: 'V44: Perspective Lines — Lines converging to vanishing point' },
  { id: 'v45', name: 'V45: Topographic — Wavy contour lines, elevation map' },
  { id: 'v46', name: 'V46: Ocean Depths — Deep navy with cyan/teal accents' },
  { id: 'v47', name: 'V47: Sunset Fire — Warm orange/red/purple rectangles' },
  { id: 'v48', name: 'V48: Forest Canopy — Dark green with tree-like verticals' },
  { id: 'v49', name: 'V49: Arctic Frost — Ice blue/white crystalline accents' },
  { id: 'v50', name: 'V50: Volcanic Ember — Black with red/orange ember dots' },
  { id: 'v51', name: 'V51: Royal Purple — Deep purple with gold ornaments' },
  { id: 'v52', name: 'V52: Copper Patina — Teal-grey with copper/verdigris' },
  { id: 'v53', name: 'V53: Neon Night — Black with hot pink/electric blue' },
  { id: 'v54', name: 'V54: Sandstone — Warm grey with terracotta/sand strata' },
  { id: 'v55', name: 'V55: Monochrome Steel — Pure grey palette, industrial' },
  { id: 'v56', name: 'V56: Vertical Split — 40/60 teal left, dark right' },
  { id: 'v57', name: 'V57: Top Banner — Colored 30% top band with logo' },
  { id: 'v58', name: 'V58: Right Sidebar — Left content, right info panel' },
  { id: 'v59', name: 'V59: Left Accent Bar — Thin gold vertical bar, editorial' },
  { id: 'v60', name: 'V60: Bottom Dock — Content above, metadata dock below' },
  { id: 'v61', name: 'V61: Z-Layout — Eye follows Z-path across card' },
  { id: 'v62', name: 'V62: Card-in-Card — Floating inner card with border' },
  { id: 'v63', name: 'V63: Three Column — Thin decorative side columns' },
  { id: 'v64', name: 'V64: Ruled Sections — Header/body/footer with dividers' },
  { id: 'v65', name: 'V65: Staircase Blocks — Overlapping rectangles stepping down' },
  { id: 'v66', name: 'V66: Drop Cap — Giant gold first letter of title' },
  { id: 'v67', name: 'V67: All Caps Impact — ALL CAPS, heavy weight, max readability' },
  { id: 'v68', name: 'V68: Serif Elegant — Light weight, decorative rules, literary' },
  { id: 'v69', name: 'V69: Stacked Words — Each word on its own line' },
  { id: 'v70', name: 'V70: Underline Accent — Bold gold bar under title' },
  { id: 'v71', name: 'V71: Highlight Marker — Highlighted text background effect' },
  { id: 'v72', name: 'V72: Title Badge — Title in bordered rounded rectangle' },
  { id: 'v73', name: 'V73: Ultra Tall — Very large font, narrow letter spacing' },
  { id: 'v74', name: 'V74: Two-Size Title — First word huge gold, rest normal' },
  { id: 'v75', name: 'V75: Centered Zen — Everything centered, generous whitespace' },
  { id: 'v76', name: 'V76: Terminal — Green text on black, console prompt' },
  { id: 'v77', name: 'V77: Code Editor — Line numbers, syntax-highlight colors' },
  { id: 'v78', name: 'V78: Matrix Rain — Character columns, green on black' },
  { id: 'v79', name: 'V79: Binary Accent — "01" strings scattered in background' },
  { id: 'v80', name: 'V80: Network Nodes — Connected circle nodes, topology' },
  { id: 'v81', name: 'V81: Dashboard — Data dashboard panel with KPI style' },
  { id: 'v82', name: 'V82: Chip Layout — Processor chip with pins, PCB feel' },
  { id: 'v83', name: 'V83: Data Table — Spreadsheet layout with grid lines' },
  { id: 'v84', name: 'V84: Progress Bar — Futuristic HUD with loading bar' },
  { id: 'v85', name: 'V85: API Docs — REST endpoint documentation style' },
  { id: 'v86', name: 'V86: Hexagon Cells — Honeycomb pattern, amber/gold' },
  { id: 'v87', name: 'V87: Triangle Mosaic — Scattered triangles, kaleidoscope' },
  { id: 'v88', name: 'V88: Diamond Lattice — Diamond shapes forming lattice' },
  { id: 'v89', name: 'V89: Chevron Pattern — V-shapes suggesting forward motion' },
  { id: 'v90', name: 'V90: Zigzag Border — Sawtooth edges top and bottom' },
  { id: 'v91', name: 'V91: Corner Ornaments — Decorative certificate-style corners' },
  { id: 'v92', name: 'V92: Ribbon Banner — Diagonal ribbon with reading time' },
  { id: 'v93', name: 'V93: Badge Seal — Circular wax seal with reading time' },
  { id: 'v94', name: 'V94: Bracket Frame — Large [ ] brackets framing title' },
  { id: 'v95', name: 'V95: Arrow Accent — Large arrow behind title, momentum' },
  { id: 'v96', name: 'V96: Magazine Cover — Bold masthead, high-fashion feel' },
  { id: 'v97', name: 'V97: Newspaper — Classic headline with masthead/dateline' },
  { id: 'v98', name: 'V98: Book Cover — Centered elegant, timeless design' },
  { id: 'v99', name: 'V99: Academic Paper — Journal article with abstract' },
  { id: 'v100', name: 'V100: Postcard — Stamp area, address-line formatting' },
  { id: 'v101', name: 'V101: Playbill — Theater poster, dramatic presentation' },
  { id: 'v102', name: 'V102: Trading Card — Stats section, holographic border' },
  { id: 'v103', name: 'V103: Ticket — Event ticket with tear-off stub' },
  { id: 'v104', name: 'V104: Album Cover — Vinyl record cover aesthetic' },
  { id: 'v105', name: 'V105: Movie Poster — Cinematic with glow and genres' },
  { id: 'v106', name: 'V106: Scattered Rects — Random rectangles, abstract art' },
  { id: 'v107', name: 'V107: Stacked Cards — Layered card depth illusion' },
  { id: 'v108', name: 'V108: Waveform Edge — Audio visualizer bars at bottom' },
  { id: 'v109', name: 'V109: Mountain Silhouette — Layered mountain ranges' },
  { id: 'v110', name: 'V110: Pixel Blocks — Pixel-art dissolve effect' },
  { id: 'v111', name: 'V111: Layered Panels — Overlapping translucent rectangles' },
  { id: 'v112', name: 'V112: Spiral Dots — Dots in spiral pattern, galaxy feel' },
  { id: 'v113', name: 'V113: Slash Marks — "/" characters scattered as texture' },
  { id: 'v114', name: 'V114: Noise Dots — Tiny dots like film grain' },
  { id: 'v115', name: 'V115: Organic Blobs — Large soft circles, color regions' },
  { id: 'v116', name: 'V116: Monogram Watermark — Huge "IX" watermark behind content' },
  { id: 'v117', name: 'V117: Timeline — Horizontal line with date marker dot' },
  { id: 'v118', name: 'V118: Quote Marks — Giant quotation marks framing title' },
  { id: 'v119', name: 'V119: Classified — Declassified dossier with stamp' },
  { id: 'v120', name: 'V120: Retro VHS — VHS distortion, offset colored layers' },
  { id: 'v121', name: 'V121: Barcode — Barcode lines at bottom, commercial feel' },
  { id: 'v122', name: 'V122: Postmark — Circular postmark stamp, vintage ink' },
  { id: 'v123', name: 'V123: Breaking News — TV news chyron, red banner' },
  { id: 'v124', name: 'V124: Japanese Minimal — Extreme negative space, zen' },
  { id: 'v125', name: 'V125: Brutalist — Thick borders, high contrast, anti-design' },
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
