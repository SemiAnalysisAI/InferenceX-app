/**
 * Exports the tutorial's flow diagram to public/images/powerx-tutorial/widgets/flow.svg so GitHub
 * shows the same drawing the page mounts live. Run from packages/app: `bun run powerx:flow-svg`.
 */
import fs from 'node:fs';
import path from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';

import {
  FLOW_SVG_EXPORT_WIDTH,
  renderStaticFlowSvg,
} from '@/components/powerx/widgets/flow-static';

const target = path.join(
  process.cwd(),
  'public',
  'images',
  'powerx-tutorial',
  'widgets',
  'flow.svg',
);
fs.writeFileSync(target, `${renderToStaticMarkup(renderStaticFlowSvg('en'))}\n`);
console.log(`wrote ${path.relative(process.cwd(), target)} at ${FLOW_SVG_EXPORT_WIDTH}px`);
