import { renderOgImage, size } from '@/app/blog/[slug]/og-image-render';
import { getModelPageSlugs } from '@/lib/model-pages';

export const alt = 'InferenceX Model Architectures';
export { size };
export const contentType = 'image/png';

export default function OgImage() {
  return renderOgImage(
    {
      title: 'Model Architectures',
      subtitle:
        'MoE and attention design, official vendor eval scores, and live inference performance for every model benchmarked on InferenceX.',
      date: '',
    },
    { dateLabel: `${getModelPageSlugs().length} models` },
  );
}
