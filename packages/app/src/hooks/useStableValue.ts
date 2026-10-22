import { useRef } from 'react';

export function useStableValue<T>(value: T, isEqual: (prev: T, next: T) => boolean): T {
  const ref = useRef(value);
  if (ref.current !== value && !isEqual(ref.current, value)) {
    ref.current = value;
  }
  return ref.current;
}
