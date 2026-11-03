export { default, generateMetadata } from '../page';

// Filter paths are unbounded: each renders on its first request, then serves from the cache.
export function generateStaticParams(): { model: string; filters: string[] }[] {
  return [];
}
