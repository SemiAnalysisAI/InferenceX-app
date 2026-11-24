// Kept free of imports: the share URL builder ships on every page and needs only these keys.
export type OverviewSearchKey =
  | 'tier'
  | 'engine'
  | 'ref'
  | 'compare'
  | 'models'
  | 'rows'
  | 'hwrows'
  | 'present';

export const OVERVIEW_SEARCH_ORDER: readonly OverviewSearchKey[] = [
  'tier',
  'engine',
  'ref',
  'compare',
  'models',
  'rows',
  'hwrows',
  'present',
];
