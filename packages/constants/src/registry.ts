/**
 * A registry read through the app enum that names its keys. Assigning the
 * registry to this type fails to compile unless the enum and the registry name
 * exactly the same keys.
 */
export type EnumKeyed<E extends string, K extends string, V> = Record<E, V> &
  Record<Exclude<K, `${E}`>, never>;
