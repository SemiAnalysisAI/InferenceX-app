export { default, generateMetadata } from '../page';

export function generateStaticParams(): { model: string; filters: string[] }[] {
  return [];
}
