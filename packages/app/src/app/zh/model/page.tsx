import ModelIndexContent from '@/components/model/ModelIndexContent';
import { modelIndexMetadata } from '@/lib/model-page-metadata';

export const metadata = modelIndexMetadata('zh');

export default function ZhModelIndexPage() {
  return <ModelIndexContent locale="zh" />;
}
