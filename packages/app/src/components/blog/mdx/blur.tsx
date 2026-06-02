import type { ReactNode } from 'react';

export function Blur(props: { children?: ReactNode }) {
  return <div className="blur-sm select-none pointer-events-none">{props.children}</div>;
}
