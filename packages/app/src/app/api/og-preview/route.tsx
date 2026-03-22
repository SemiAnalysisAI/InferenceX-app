import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

import { getPostBySlug } from '@/lib/blog';

import { renderOgImage as v1 } from '@/app/blog/[slug]/og-variants/v1-current';
import { renderOgImage as v2 } from '@/app/blog/[slug]/og-variants/v2-circuit-corners';
import { renderOgImage as v3 } from '@/app/blog/[slug]/og-variants/v3-grid-overlay';
import { renderOgImage as v4 } from '@/app/blog/[slug]/og-variants/v4-left-stripe';
import { renderOgImage as v5 } from '@/app/blog/[slug]/og-variants/v5-diagonal-blocks';
import { renderOgImage as v6 } from '@/app/blog/[slug]/og-variants/v6-top-bar';
import { renderOgImage as v7 } from '@/app/blog/[slug]/og-variants/v7-right-panel';
import { renderOgImage as v8 } from '@/app/blog/[slug]/og-variants/v8-bottom-circuit';
import { renderOgImage as v9 } from '@/app/blog/[slug]/og-variants/v9-scattered-nodes';
import { renderOgImage as v10 } from '@/app/blog/[slug]/og-variants/v10-border-frame';
import { renderOgImage as v11 } from '@/app/blog/[slug]/og-variants/v11-brand-corners';
import { renderOgImage as v12 } from '@/app/blog/[slug]/og-variants/v12-brand-grid';
import { renderOgImage as v13 } from '@/app/blog/[slug]/og-variants/v13-brand-left-panel';
import { renderOgImage as v14 } from '@/app/blog/[slug]/og-variants/v14-brand-frame-gold';
import { renderOgImage as v15 } from '@/app/blog/[slug]/og-variants/v15-brand-split';
import { renderOgImage as v16 } from '@/app/blog/[slug]/og-variants/v16-slide-title';
import { renderOgImage as v17 } from '@/app/blog/[slug]/og-variants/v17-slide-content';
import { renderOgImage as v18 } from '@/app/blog/[slug]/og-variants/v18-slide-hybrid';
import { renderOgImage as v19 } from '@/app/blog/[slug]/og-variants/v19-slide-keynote';
import { renderOgImage as v20 } from '@/app/blog/[slug]/og-variants/v20-slide-full';
import { renderOgImage as v21 } from '@/app/blog/[slug]/og-variants/v21-compact-bold';
import { renderOgImage as v22 } from '@/app/blog/[slug]/og-variants/v22-gold-title-bar';
import { renderOgImage as v23 } from '@/app/blog/[slug]/og-variants/v23-bold-circuit';
import { renderOgImage as v24 } from '@/app/blog/[slug]/og-variants/v24-gold-split-bold';
import { renderOgImage as v25 } from '@/app/blog/[slug]/og-variants/v25-gold-accent-stripe';
import { renderOgImage as v26 } from '@/app/blog/[slug]/og-variants/v26-halftone-dots';
import { renderOgImage as v27 } from '@/app/blog/[slug]/og-variants/v27-dot-grid';
import { renderOgImage as v28 } from '@/app/blog/[slug]/og-variants/v28-constellation';
import { renderOgImage as v29 } from '@/app/blog/[slug]/og-variants/v29-particle-burst';
import { renderOgImage as v30 } from '@/app/blog/[slug]/og-variants/v30-dot-border';
import { renderOgImage as v31 } from '@/app/blog/[slug]/og-variants/v31-concentric-rings';
import { renderOgImage as v32 } from '@/app/blog/[slug]/og-variants/v32-venn-overlap';
import { renderOgImage as v33 } from '@/app/blog/[slug]/og-variants/v33-floating-bubbles';
import { renderOgImage as v34 } from '@/app/blog/[slug]/og-variants/v34-ripple-waves';
import { renderOgImage as v35 } from '@/app/blog/[slug]/og-variants/v35-corner-arcs';
import { renderOgImage as v36 } from '@/app/blog/[slug]/og-variants/v36-scan-lines';
import { renderOgImage as v37 } from '@/app/blog/[slug]/og-variants/v37-vertical-blinds';
import { renderOgImage as v38 } from '@/app/blog/[slug]/og-variants/v38-crosshatch';
import { renderOgImage as v39 } from '@/app/blog/[slug]/og-variants/v39-sound-wave';
import { renderOgImage as v40 } from '@/app/blog/[slug]/og-variants/v40-radial-rays';
import { renderOgImage as v41 } from '@/app/blog/[slug]/og-variants/v41-isometric-grid';
import { renderOgImage as v42 } from '@/app/blog/[slug]/og-variants/v42-blueprint';
import { renderOgImage as v43 } from '@/app/blog/[slug]/og-variants/v43-glitch-grid';
import { renderOgImage as v44 } from '@/app/blog/[slug]/og-variants/v44-perspective-lines';
import { renderOgImage as v45 } from '@/app/blog/[slug]/og-variants/v45-topographic';
import { renderOgImage as v46 } from '@/app/blog/[slug]/og-variants/v46-ocean-depths';
import { renderOgImage as v47 } from '@/app/blog/[slug]/og-variants/v47-sunset-fire';
import { renderOgImage as v48 } from '@/app/blog/[slug]/og-variants/v48-forest-canopy';
import { renderOgImage as v49 } from '@/app/blog/[slug]/og-variants/v49-arctic-frost';
import { renderOgImage as v50 } from '@/app/blog/[slug]/og-variants/v50-volcanic-ember';
import { renderOgImage as v51 } from '@/app/blog/[slug]/og-variants/v51-royal-purple';
import { renderOgImage as v52 } from '@/app/blog/[slug]/og-variants/v52-copper-patina';
import { renderOgImage as v53 } from '@/app/blog/[slug]/og-variants/v53-neon-night';
import { renderOgImage as v54 } from '@/app/blog/[slug]/og-variants/v54-sandstone';
import { renderOgImage as v55 } from '@/app/blog/[slug]/og-variants/v55-monochrome-steel';
import { renderOgImage as v56 } from '@/app/blog/[slug]/og-variants/v56-vertical-split';
import { renderOgImage as v57 } from '@/app/blog/[slug]/og-variants/v57-top-banner';
import { renderOgImage as v58 } from '@/app/blog/[slug]/og-variants/v58-right-sidebar';
import { renderOgImage as v59 } from '@/app/blog/[slug]/og-variants/v59-left-accent-bar';
import { renderOgImage as v60 } from '@/app/blog/[slug]/og-variants/v60-bottom-dock';
import { renderOgImage as v61 } from '@/app/blog/[slug]/og-variants/v61-z-layout';
import { renderOgImage as v62 } from '@/app/blog/[slug]/og-variants/v62-card-in-card';
import { renderOgImage as v63 } from '@/app/blog/[slug]/og-variants/v63-three-column';
import { renderOgImage as v64 } from '@/app/blog/[slug]/og-variants/v64-ruled-sections';
import { renderOgImage as v65 } from '@/app/blog/[slug]/og-variants/v65-staircase-blocks';
import { renderOgImage as v66 } from '@/app/blog/[slug]/og-variants/v66-drop-cap';
import { renderOgImage as v67 } from '@/app/blog/[slug]/og-variants/v67-all-caps-impact';
import { renderOgImage as v68 } from '@/app/blog/[slug]/og-variants/v68-serif-elegant';
import { renderOgImage as v69 } from '@/app/blog/[slug]/og-variants/v69-stacked-words';
import { renderOgImage as v70 } from '@/app/blog/[slug]/og-variants/v70-underline-accent';
import { renderOgImage as v71 } from '@/app/blog/[slug]/og-variants/v71-highlight-marker';
import { renderOgImage as v72 } from '@/app/blog/[slug]/og-variants/v72-title-badge';
import { renderOgImage as v73 } from '@/app/blog/[slug]/og-variants/v73-ultra-tall';
import { renderOgImage as v74 } from '@/app/blog/[slug]/og-variants/v74-two-size';
import { renderOgImage as v75 } from '@/app/blog/[slug]/og-variants/v75-centered-zen';
import { renderOgImage as v76 } from '@/app/blog/[slug]/og-variants/v76-terminal';
import { renderOgImage as v77 } from '@/app/blog/[slug]/og-variants/v77-code-editor';
import { renderOgImage as v78 } from '@/app/blog/[slug]/og-variants/v78-matrix-rain';
import { renderOgImage as v79 } from '@/app/blog/[slug]/og-variants/v79-binary-accent';
import { renderOgImage as v80 } from '@/app/blog/[slug]/og-variants/v80-network-nodes';
import { renderOgImage as v81 } from '@/app/blog/[slug]/og-variants/v81-dashboard';
import { renderOgImage as v82 } from '@/app/blog/[slug]/og-variants/v82-chip-layout';
import { renderOgImage as v83 } from '@/app/blog/[slug]/og-variants/v83-data-table';
import { renderOgImage as v84 } from '@/app/blog/[slug]/og-variants/v84-progress-bar';
import { renderOgImage as v85 } from '@/app/blog/[slug]/og-variants/v85-api-docs';
import { renderOgImage as v86 } from '@/app/blog/[slug]/og-variants/v86-hexagon-cells';
import { renderOgImage as v87 } from '@/app/blog/[slug]/og-variants/v87-triangle-mosaic';
import { renderOgImage as v88 } from '@/app/blog/[slug]/og-variants/v88-diamond-lattice';
import { renderOgImage as v89 } from '@/app/blog/[slug]/og-variants/v89-chevron-pattern';
import { renderOgImage as v90 } from '@/app/blog/[slug]/og-variants/v90-zigzag-border';
import { renderOgImage as v91 } from '@/app/blog/[slug]/og-variants/v91-corner-ornaments';
import { renderOgImage as v92 } from '@/app/blog/[slug]/og-variants/v92-ribbon-banner';
import { renderOgImage as v93 } from '@/app/blog/[slug]/og-variants/v93-badge-seal';
import { renderOgImage as v94 } from '@/app/blog/[slug]/og-variants/v94-bracket-frame';
import { renderOgImage as v95 } from '@/app/blog/[slug]/og-variants/v95-arrow-accent';
import { renderOgImage as v96 } from '@/app/blog/[slug]/og-variants/v96-magazine-cover';
import { renderOgImage as v97 } from '@/app/blog/[slug]/og-variants/v97-newspaper';
import { renderOgImage as v98 } from '@/app/blog/[slug]/og-variants/v98-book-cover';
import { renderOgImage as v99 } from '@/app/blog/[slug]/og-variants/v99-academic-paper';
import { renderOgImage as v100 } from '@/app/blog/[slug]/og-variants/v100-postcard';
import { renderOgImage as v101 } from '@/app/blog/[slug]/og-variants/v101-playbill';
import { renderOgImage as v102 } from '@/app/blog/[slug]/og-variants/v102-trading-card';
import { renderOgImage as v103 } from '@/app/blog/[slug]/og-variants/v103-ticket';
import { renderOgImage as v104 } from '@/app/blog/[slug]/og-variants/v104-album-cover';
import { renderOgImage as v105 } from '@/app/blog/[slug]/og-variants/v105-movie-poster';
import { renderOgImage as v106 } from '@/app/blog/[slug]/og-variants/v106-scattered-rects';
import { renderOgImage as v107 } from '@/app/blog/[slug]/og-variants/v107-stacked-cards';
import { renderOgImage as v108 } from '@/app/blog/[slug]/og-variants/v108-waveform-edge';
import { renderOgImage as v109 } from '@/app/blog/[slug]/og-variants/v109-mountain-silhouette';
import { renderOgImage as v110 } from '@/app/blog/[slug]/og-variants/v110-pixel-blocks';
import { renderOgImage as v111 } from '@/app/blog/[slug]/og-variants/v111-layered-panels';
import { renderOgImage as v112 } from '@/app/blog/[slug]/og-variants/v112-spiral-dots';
import { renderOgImage as v113 } from '@/app/blog/[slug]/og-variants/v113-slash-marks';
import { renderOgImage as v114 } from '@/app/blog/[slug]/og-variants/v114-noise-dots';
import { renderOgImage as v115 } from '@/app/blog/[slug]/og-variants/v115-organic-blobs';
import { renderOgImage as v116 } from '@/app/blog/[slug]/og-variants/v116-monogram-watermark';
import { renderOgImage as v117 } from '@/app/blog/[slug]/og-variants/v117-timeline';
import { renderOgImage as v118 } from '@/app/blog/[slug]/og-variants/v118-quote-marks';
import { renderOgImage as v119 } from '@/app/blog/[slug]/og-variants/v119-classified';
import { renderOgImage as v120 } from '@/app/blog/[slug]/og-variants/v120-retro-vhs';
import { renderOgImage as v121 } from '@/app/blog/[slug]/og-variants/v121-barcode';
import { renderOgImage as v122 } from '@/app/blog/[slug]/og-variants/v122-postmark';
import { renderOgImage as v123 } from '@/app/blog/[slug]/og-variants/v123-breaking-news';
import { renderOgImage as v124 } from '@/app/blog/[slug]/og-variants/v124-japanese-minimal';
import { renderOgImage as v125 } from '@/app/blog/[slug]/og-variants/v125-brutalist';
import { renderOgImage as v126 } from '@/app/blog/[slug]/og-variants/v126-ancient-scroll';
import { renderOgImage as v127 } from '@/app/blog/[slug]/og-variants/v127-cave-painting';
import { renderOgImage as v128 } from '@/app/blog/[slug]/og-variants/v128-art-deco';
import { renderOgImage as v129 } from '@/app/blog/[slug]/og-variants/v129-constructivist';
import { renderOgImage as v130 } from '@/app/blog/[slug]/og-variants/v130-ukiyo-e';
import { renderOgImage as v131 } from '@/app/blog/[slug]/og-variants/v131-stained-glass';
import { renderOgImage as v132 } from '@/app/blog/[slug]/og-variants/v132-hieroglyphs';
import { renderOgImage as v133 } from '@/app/blog/[slug]/og-variants/v133-illuminated';
import { renderOgImage as v134 } from '@/app/blog/[slug]/og-variants/v134-pop-art';
import { renderOgImage as v135 } from '@/app/blog/[slug]/og-variants/v135-bauhaus';
import { renderOgImage as v136 } from '@/app/blog/[slug]/og-variants/v136-chalkboard';
import { renderOgImage as v137 } from '@/app/blog/[slug]/og-variants/v137-neon-sign';
import { renderOgImage as v138 } from '@/app/blog/[slug]/og-variants/v138-leather-book';
import { renderOgImage as v139 } from '@/app/blog/[slug]/og-variants/v139-shipping-label';
import { renderOgImage as v140 } from '@/app/blog/[slug]/og-variants/v140-polaroid';
import { renderOgImage as v141 } from '@/app/blog/[slug]/og-variants/v141-cassette';
import { renderOgImage as v142 } from '@/app/blog/[slug]/og-variants/v142-license-plate';
import { renderOgImage as v143 } from '@/app/blog/[slug]/og-variants/v143-credit-card';
import { renderOgImage as v144 } from '@/app/blog/[slug]/og-variants/v144-prescription';
import { renderOgImage as v145 } from '@/app/blog/[slug]/og-variants/v145-billboard';
import { renderOgImage as v146 } from '@/app/blog/[slug]/og-variants/v146-dna-helix';
import { renderOgImage as v147 } from '@/app/blog/[slug]/og-variants/v147-star-chart';
import { renderOgImage as v148 } from '@/app/blog/[slug]/og-variants/v148-weather-map';
import { renderOgImage as v149 } from '@/app/blog/[slug]/og-variants/v149-periodic-element';
import { renderOgImage as v150 } from '@/app/blog/[slug]/og-variants/v150-microscope';
import { renderOgImage as v151 } from '@/app/blog/[slug]/og-variants/v151-seismograph';
import { renderOgImage as v152 } from '@/app/blog/[slug]/og-variants/v152-aurora';
import { renderOgImage as v153 } from '@/app/blog/[slug]/og-variants/v153-coral-reef';
import { renderOgImage as v154 } from '@/app/blog/[slug]/og-variants/v154-crystal';
import { renderOgImage as v155 } from '@/app/blog/[slug]/og-variants/v155-telescope';
import { renderOgImage as v156 } from '@/app/blog/[slug]/og-variants/v156-receipt';
import { renderOgImage as v157 } from '@/app/blog/[slug]/og-variants/v157-passport';
import { renderOgImage as v158 } from '@/app/blog/[slug]/og-variants/v158-ransom-note';
import { renderOgImage as v159 } from '@/app/blog/[slug]/og-variants/v159-typewriter';
import { renderOgImage as v160 } from '@/app/blog/[slug]/og-variants/v160-sticky-note';
import { renderOgImage as v161 } from '@/app/blog/[slug]/og-variants/v161-safety-card';
import { renderOgImage as v162 } from '@/app/blog/[slug]/og-variants/v162-nutrition-label';
import { renderOgImage as v163 } from '@/app/blog/[slug]/og-variants/v163-warning-sign';
import { renderOgImage as v164 } from '@/app/blog/[slug]/og-variants/v164-test-pattern';
import { renderOgImage as v165 } from '@/app/blog/[slug]/og-variants/v165-boot-screen';
import { renderOgImage as v166 } from '@/app/blog/[slug]/og-variants/v166-mondrian';
import { renderOgImage as v167 } from '@/app/blog/[slug]/og-variants/v167-rothko';
import { renderOgImage as v168 } from '@/app/blog/[slug]/og-variants/v168-kandinsky';
import { renderOgImage as v169 } from '@/app/blog/[slug]/og-variants/v169-impossible';
import { renderOgImage as v170 } from '@/app/blog/[slug]/og-variants/v170-op-art';
import { renderOgImage as v171 } from '@/app/blog/[slug]/og-variants/v171-data-mosh';
import { renderOgImage as v172 } from '@/app/blog/[slug]/og-variants/v172-risograph';
import { renderOgImage as v173 } from '@/app/blog/[slug]/og-variants/v173-linocut';
import { renderOgImage as v174 } from '@/app/blog/[slug]/og-variants/v174-psychedelic';
import { renderOgImage as v175 } from '@/app/blog/[slug]/og-variants/v175-hologram';

const variants: Record<string, (meta: any) => Promise<ImageResponse>> = {
  v1,
  v2,
  v3,
  v4,
  v5,
  v6,
  v7,
  v8,
  v9,
  v10,
  v11,
  v12,
  v13,
  v14,
  v15,
  v16,
  v17,
  v18,
  v19,
  v20,
  v21,
  v22,
  v23,
  v24,
  v25,
  v26,
  v27,
  v28,
  v29,
  v30,
  v31,
  v32,
  v33,
  v34,
  v35,
  v36,
  v37,
  v38,
  v39,
  v40,
  v41,
  v42,
  v43,
  v44,
  v45,
  v46,
  v47,
  v48,
  v49,
  v50,
  v51,
  v52,
  v53,
  v54,
  v55,
  v56,
  v57,
  v58,
  v59,
  v60,
  v61,
  v62,
  v63,
  v64,
  v65,
  v66,
  v67,
  v68,
  v69,
  v70,
  v71,
  v72,
  v73,
  v74,
  v75,
  v76,
  v77,
  v78,
  v79,
  v80,
  v81,
  v82,
  v83,
  v84,
  v85,
  v86,
  v87,
  v88,
  v89,
  v90,
  v91,
  v92,
  v93,
  v94,
  v95,
  v96,
  v97,
  v98,
  v99,
  v100,
  v101,
  v102,
  v103,
  v104,
  v105,
  v106,
  v107,
  v108,
  v109,
  v110,
  v111,
  v112,
  v113,
  v114,
  v115,
  v116,
  v117,
  v118,
  v119,
  v120,
  v121,
  v122,
  v123,
  v124,
  v125,
  v126,
  v127,
  v128,
  v129,
  v130,
  v131,
  v132,
  v133,
  v134,
  v135,
  v136,
  v137,
  v138,
  v139,
  v140,
  v141,
  v142,
  v143,
  v144,
  v145,
  v146,
  v147,
  v148,
  v149,
  v150,
  v151,
  v152,
  v153,
  v154,
  v155,
  v156,
  v157,
  v158,
  v159,
  v160,
  v161,
  v162,
  v163,
  v164,
  v165,
  v166,
  v167,
  v168,
  v169,
  v170,
  v171,
  v172,
  v173,
  v174,
  v175,
};

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug') ?? 'hello-world';
  const variant = request.nextUrl.searchParams.get('v') ?? 'v1';

  const result = getPostBySlug(slug);
  if (!result) {
    return new Response('Post not found', { status: 404 });
  }

  const render = variants[variant];
  if (!render) {
    return new Response(
      `Unknown variant: ${variant}. Available: ${Object.keys(variants).join(', ')}`,
      { status: 400 },
    );
  }

  return await render(result.meta);
}
