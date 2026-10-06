'use client';

import { lazy, Suspense, useEffect, useState } from 'react';

// React.lazy does not fetch the theme (including its CSS) until it is rendered.
const KartTheme = lazy(() => import('./kart-decorations'));

export function KartThemeLazy() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const check = () =>
      setActive(
        document.documentElement.classList.contains('kart') &&
          !Object.hasOwn(document.documentElement.dataset, 'inferencexEmbed'),
      );
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-inferencex-embed'],
    });
    return () => observer.disconnect();
  }, []);
  return active ? (
    <Suspense fallback={null}>
      <KartTheme />
    </Suspense>
  ) : null;
}
