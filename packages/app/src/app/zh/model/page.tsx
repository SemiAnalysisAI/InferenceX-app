import ModelIndexContent from '@/components/model/ModelIndexContent';
import { modelIndexMetadata } from '@/lib/catalog/model-page-metadata';

export const metadata = modelIndexMetadata('zh');

export default function ZhModelIndexPage() {
  return <ModelIndexContent locale="zh" />;
}
