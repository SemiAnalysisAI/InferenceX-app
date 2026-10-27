'use client';

import { useEffect } from 'react';
import { isEmbedPathname } from '@/lib/embed/embed-route';
import { useLocale } from '@/lib/i18n/use-locale';
import './orange-chicken-theme.css';

const CHART_SELECTOR = '[data-orange-chicken-eligible="true"]';
const POINT_SELECTOR = '.dot-group, .unofficial-overlay-pt';
const MARKER_CLASS = 'orange-chicken-marker';
const DECORATED_ATTRIBUTE = 'data-orange-chicken-decorated';
const SVG_NS = 'http://www.w3.org/2000/svg';

// Original artwork, kept in this lazy chunk. A data URI needs no asset request and
// keeps gradient IDs local to each image, including when a chart is exported.
const CHICKEN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="glaze" x1="0.2" y1="0" x2="0.75" y2="1">
      <stop stop-color="#ffc65b"/><stop offset=".34" stop-color="#f58b1f"/>
      <stop offset=".7" stop-color="#d94c0c"/><stop offset="1" stop-color="#8c290b"/>
    </linearGradient>
    <radialGradient id="shine" cx=".28" cy=".2" r=".8">
      <stop stop-color="#fff3b9" stop-opacity=".9"/><stop offset=".5" stop-color="#ffb526" stop-opacity=".15"/>
      <stop offset="1" stop-color="#ad3008" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <path d="M9 24c-2-7 5-13 12-12 4-7 14-8 20-2 9-1 15 5 14 13 6 5 5 15-1 19-1 9-11 15-19 12-7 5-17 1-20-5-8-2-12-9-8-16-2-3-1-6 2-9Z"
    fill="url(#glaze)" stroke="#85300e" stroke-width="2"/>
  <path d="M10 25c0-6 5-10 12-9 5-6 12-6 17-2 8-1 12 3 12 10 5 5 3 10-1 13-10 6-25 7-35-2-3-2-5-6-5-10Z"
    fill="url(#shine)"/>
  <path d="M12 36c3 9 9 8 13 12m12-1c8 2 13-2 14-7M18 21c5-6 11-6 16-4"
    fill="none" stroke="#ffbd50" stroke-width="2.6" stroke-linecap="round" opacity=".8"/>
  <path d="m15 30 5-2m20 9 6-2m-16 7 3-3m12-16 3 3m-27 8 4 3"
    fill="none" stroke="#a7360b" stroke-width="2.5" stroke-linecap="round" opacity=".65"/>
  <g fill="#fff0c0" stroke="#d89840" stroke-width=".5">
    <ellipse cx="24" cy="22" rx="1.5" ry="3.4" transform="rotate(35 24 22)"/>
    <ellipse cx="39" cy="20" rx="1.4" ry="3" transform="rotate(-42 39 20)"/>
    <ellipse cx="33" cy="32" rx="1.5" ry="3.4" transform="rotate(62 33 32)"/>
    <ellipse cx="46" cy="34" rx="1.4" ry="3.1" transform="rotate(20 46 34)"/>
    <ellipse cx="23" cy="42" rx="1.4" ry="3" transform="rotate(-38 23 42)"/>
  </g>
  <path d="m20 18 3-1m11 8 3-1m-20 8 2 1" stroke="#fff6ce" stroke-width="2.2" stroke-linecap="round"/>
</svg>`;
const CHICKEN_IMAGE = `data:image/svg+xml,${encodeURIComponent(CHICKEN_SVG)}`;

const STRINGS = {
  en: {
    title: 'Orange chicken mode',
    description:
      'Sesame-glazed chicken for every AgentX point. The data and controls stay the same.',
  },
  zh: {
    title: '陈皮鸡主题',
    description: '每个 AgentX 数据点都换成撒了芝麻的陈皮鸡图标，数据和控件保持不变。',
  },
};

function useChickenMarkers() {
  useEffect(() => {
    const root = document.documentElement;
    const decorated = new Map<SVGGElement, SVGImageElement>();
    let pendingFrame: number | undefined;

    const isActive = () =>
      root.classList.contains('orange-chicken') &&
      !Object.hasOwn(root.dataset, 'inferencexEmbed') &&
      !isEmbedPathname(window.location.pathname);

    const removeMarker = (point: SVGGElement, marker: SVGImageElement) => {
      marker.remove();
      point.removeAttribute(DECORATED_ATTRIBUTE);
      decorated.delete(point);
    };

    const sync = () => {
      pendingFrame = undefined;
      const active = isActive();
      for (const [point, marker] of decorated) {
        if (!active || !point.isConnected || !point.closest(CHART_SELECTOR)) {
          removeMarker(point, marker);
        }
      }
      if (!active) return;

      document.querySelectorAll(CHART_SELECTOR).forEach((chart) => {
        chart.querySelectorAll<SVGGElement>(POINT_SELECTOR).forEach((point) => {
          const existing = decorated.get(point);
          if (existing?.parentNode === point) return;
          if (existing) removeMarker(point, existing);
          const marker = document.createElementNS(SVG_NS, 'image');
          marker.setAttribute('class', MARKER_CLASS);
          marker.setAttribute('href', CHICKEN_IMAGE);
          marker.setAttribute('x', '-10');
          marker.setAttribute('y', '-10');
          marker.setAttribute('width', '20');
          marker.setAttribute('height', '20');
          marker.setAttribute('aria-hidden', 'true');
          marker.setAttribute('focusable', 'false');
          marker.setAttribute('pointer-events', 'none');
          // Do not replace shapes, hit circles, data, transforms or event handlers.
          // Being a child of the point inherits clipping, visibility and zoom.
          const label = point.querySelector(':scope > text');
          if (label) label.before(marker);
          else point.append(marker);
          point.setAttribute(DECORATED_ATTRIBUTE, '');
          decorated.set(point, marker);
        });
      });
    };

    const schedule = () => {
      if (pendingFrame === undefined) pendingFrame = requestAnimationFrame(sync);
    };

    const relevantNode = (node: Node) =>
      node instanceof Element &&
      !node.classList.contains(MARKER_CLASS) &&
      (node.matches(`${CHART_SELECTOR}, ${POINT_SELECTOR}`) ||
        node.querySelector(`${CHART_SELECTOR}, ${POINT_SELECTOR}`) !== null);

    // No transform/style observation: pan, zoom and filtering already operate on
    // the parent group. Only chart/point insertion, removal and eligibility matter.
    const chartObserver = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            record.type === 'attributes' ||
            [...record.addedNodes, ...record.removedNodes].some(relevantNode) ||
            [...record.removedNodes].some(
              (node) =>
                node instanceof Element &&
                node.classList.contains(MARKER_CLASS) &&
                record.target instanceof SVGGElement &&
                decorated.has(record.target),
            ),
        )
      ) {
        schedule();
      }
    });
    chartObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-orange-chicken-eligible'],
    });
    const themeObserver = new MutationObserver(schedule);
    themeObserver.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'data-inferencex-embed'],
    });
    sync();

    return () => {
      chartObserver.disconnect();
      themeObserver.disconnect();
      if (pendingFrame !== undefined) cancelAnimationFrame(pendingFrame);
      for (const [point, marker] of decorated) removeMarker(point, marker);
    };
  }, []);
}

function PandaTakeout() {
  return (
    <svg className="orange-chicken-banner-art" viewBox="0 0 260 156" aria-hidden="true">
      <ellipse cx="134" cy="143" rx="91" ry="7" fill="#7e3617" opacity=".12" />
      <circle cx="75" cy="33" r="18" fill="#25211f" />
      <circle cx="144" cy="31" r="18" fill="#25211f" />
      <ellipse cx="110" cy="61" rx="49" ry="43" fill="#fffdf6" stroke="#38281e" strokeWidth="2" />
      <ellipse cx="89" cy="56" rx="12" ry="15" fill="#25211f" transform="rotate(24 89 56)" />
      <ellipse cx="130" cy="56" rx="12" ry="15" fill="#25211f" transform="rotate(-24 130 56)" />
      <circle cx="92" cy="53" r="3.5" fill="#fffdf6" />
      <circle cx="127" cy="53" r="3.5" fill="#fffdf6" />
      <path d="M104 69q6-4 12 0l-6 6Z" fill="#25211f" />
      <path
        d="M101 80q9 8 18 0"
        fill="none"
        stroke="#25211f"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="m159 96 62-81m-50 86 67-71" stroke="#945024" strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="136" cy="100" rx="78" ry="20" fill="#9b3611" />
      <image
        href={CHICKEN_IMAGE}
        x="65"
        y="66"
        width="52"
        height="52"
        transform="rotate(-18 91 92)"
      />
      <image href={CHICKEN_IMAGE} x="102" y="56" width="53" height="53" />
      <image
        href={CHICKEN_IMAGE}
        x="140"
        y="66"
        width="52"
        height="52"
        transform="rotate(20 166 92)"
      />
      <image href={CHICKEN_IMAGE} x="91" y="80" width="50" height="50" />
      <image href={CHICKEN_IMAGE} x="131" y="83" width="47" height="47" />
      <path
        d="M57 100q79 31 158 0l-19 37q-59 19-118 0Z"
        fill="#fff9e8"
        stroke="#b3421c"
        strokeWidth="2"
      />
      <path d="M65 113q71 26 142 0" fill="none" stroke="#ce4c20" strokeWidth="5" />
      <path d="M122 130h27" stroke="#ce4c20" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="65" cy="93" rx="15" ry="10" fill="#25211f" transform="rotate(24 65 93)" />
    </svg>
  );
}

export default function OrangeChickenTheme() {
  useChickenMarkers();
  const strings = STRINGS[useLocale()];
  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="orange-chicken-theme-banner">
      <div className="orange-chicken-theme-banner">
        <div className="min-w-0">
          <p className="text-xl font-bold sm:text-2xl">{strings.title}</p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed">{strings.description}</p>
        </div>
        <PandaTakeout />
      </div>
    </div>
  );
}
