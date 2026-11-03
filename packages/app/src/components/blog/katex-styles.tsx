'use client';

import dynamic from 'next/dynamic';

// Rendering this from the server emits KaTeX's stylesheet link for that page only, so the
// render-blocking CSS ships with posts that contain math instead of with every article.
export const KatexStyles = dynamic(() => import('./katex-stylesheet'));
