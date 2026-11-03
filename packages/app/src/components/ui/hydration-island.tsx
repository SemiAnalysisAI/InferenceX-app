'use client';

import { Activity, type ComponentType, createElement } from 'react';

export function hydrationIsland<P extends object>(LazyComponent: ComponentType<P>) {
  return function HydrationIsland(props: P) {
    return <Activity mode="visible">{createElement(LazyComponent, props)}</Activity>;
  };
}
