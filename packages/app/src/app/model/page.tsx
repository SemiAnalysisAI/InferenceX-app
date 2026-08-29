import ModelIndexContent from '@/components/model/ModelIndexContent';
import { modelIndexMetadata } from '@/lib/model-page-metadata';

export const metadata = modelIndexMetadata('en');

export default function ModelIndexPage() {
  return <ModelIndexContent locale="en" />;
}
