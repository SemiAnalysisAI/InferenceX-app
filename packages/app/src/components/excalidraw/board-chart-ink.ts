const figure = '[data-testid="chart-figure"]';
const line = '.line-path, .roofline-path, .overlay-roofline-path';
const lines = `${figure} svg[data-testid="d3-chart-svg"] :is(${line})`;
const humanStroke = 'excalidraw-chart-pen-trace';
const emptySelector = '[data-testid="scatter-empty-state"], [data-testid="chart-empty-state"]';
const emptyInk = 'excalidraw-chart-despair';
const metricInk = 'excalidraw-chart-box-joke';
const metricSelector = '[data-testid="yaxis-metric-selector"]';
const skeleton = 'excalidraw-chart-loading-preview';
const svg = 'http://www.w3.org/2000/svg';

/** Trace real projected paths without changing/hiding the underlying chart or accepting input. */
export function mountChartInk() {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const highContrast = matchMedia('(forced-colors: active)');
  let sample = 0;
  let finish = 0;
  let lastFigure: HTMLElement | null = null;
  let lastReading = '';
  let lastMetric = '';
  let metricTimer = 0;
  const clear = () => {
    document.querySelectorAll(`.${humanStroke}`).forEach((path) => path.remove());
    delete lastFigure?.dataset.excalidrawInking;
  };

  const trace = () => {
    const chart = document.querySelector<HTMLElement>(figure);
    const zh = document.documentElement.lang === 'zh';
    for (const state of document.querySelectorAll<HTMLElement>(emptySelector)) {
      if (state.querySelector(`.${emptyInk}`)) continue;
      const note = document.createElement('p');
      note.className = emptyInk;
      const hidden = state.dataset.reason === 'hidden';
      const clipped = state.dataset.reason === 'clipped';
      note.textContent = hidden
        ? zh
          ? '绝望涂鸦：筛选找到了数据，可图例把芯片都藏起来了。'
          : 'Despair: The filters found points. The legend hid every chip.'
        : clipped
          ? zh
            ? '绝望涂鸦：前沿还在，只是画到轴线外面去了。'
            : 'Despair: There is a frontier. I drew it beyond the axis limits.'
          : zh
            ? '绝望涂鸦：画了半天帕累托前沿，当前选择却只剩 0 个数据点。'
            : 'Despair: I drew a whole Pareto frontier. This selection returned 0 points.';
      state.append(note);
    }
    // The real skeleton is styled CSS-only. This opt-in preview keeps it on
    // screen for screenshot tools without delaying the request or hiding data.
    if (
      chart &&
      new URLSearchParams(location.search).get('excalidraw-preview') === 'loading' &&
      !chart.querySelector(`.${skeleton}`)
    ) {
      const preview = document.createElement('section');
      preview.className = `${skeleton} no-export`;
      preview.setAttribute('role', 'status');
      preview.dataset.slot = 'skeleton';
      preview.dataset.preview = 'chart-loading';
      preview.textContent = zh
        ? '加载状态预览 · 正在绘制图表…'
        : 'Loading preview · Sketching the chart…';
      chart.prepend(preview);
    }
    if (!chart) return;
    const paths = [...chart.querySelectorAll<SVGPathElement>(lines)].filter(
      (path) =>
        !path.closest('[id$="-export"]') &&
        Boolean(path.getAttribute('d')) &&
        path.style.opacity !== '0' &&
        path.style.display !== 'none' &&
        path.getAttribute('opacity') !== '0',
    );
    if (paths.length === 0) return;
    const metric = document.querySelector(metricSelector)?.textContent?.trim() ?? '';
    if (lastMetric && metric && metric !== lastMetric && chart === lastFigure) {
      document.querySelector(`.${metricInk}`)?.remove();
      const note = document.createElement('p');
      note.className = `${metricInk} no-export`;
      note.setAttribute('role', 'status');
      const art = document.createElement('img');
      art.src = '/decorative/excalidraw/architecture-strip.webp';
      art.alt = '';
      art.width = 86;
      art.height = 25;
      const text = document.createElement('span');
      text.textContent = zh
        ? `「就改一个指标」：${metric}。结果画了三层方框解释这个分母。`
        : `“Just change one metric”: ${metric}. Three boxes later, we’re still explaining the denominator.`;
      note.append(art, text);
      chart.querySelector('figcaption')?.append(note);
      window.clearTimeout(metricTimer);
      metricTimer = window.setTimeout(() => note.remove(), 4700);
    }
    lastMetric = metric;
    // Geometry changes due to zoom/resize do not restart the sketch. Metadata changes
    // and a different set of visible series are chart updates.
    const reading = [
      location.pathname,
      location.search,
      metric,
      chart.querySelector('figcaption h2')?.textContent,
      ...paths.map(
        (path) => path.dataset.lineKey ?? path.dataset.hwKey ?? path.getAttribute('class'),
      ),
    ].join('|');
    if (chart === lastFigure && reading === lastReading) return;
    clear();
    lastFigure = chart;
    lastReading = reading;
    if (reduce.matches || highContrast.matches) return;
    chart.dataset.excalidrawInking = 'true';
    for (const [index, source] of paths.slice(0, 18).entries()) {
      const path = document.createElementNS(svg, 'path');
      path.setAttribute('d', source.getAttribute('d')!);
      path.setAttribute('stroke', source.getAttribute('stroke') ?? 'currentColor');
      path.setAttribute('fill', 'none');
      path.setAttribute('pathLength', '1');
      path.setAttribute('aria-hidden', 'true');
      path.setAttribute('pointer-events', 'none');
      const clip = source.getAttribute('clip-path');
      if (clip) path.setAttribute('clip-path', clip);
      path.classList.add(humanStroke, 'no-export');
      path.style.animationDelay = `${Math.min(index, 8) * 24}ms`;
      source.after(path);
    }
    window.clearTimeout(finish);
    finish = window.setTimeout(clear, 1380);
  };
  const queue = () => {
    // Batch React/D3 writes and don't do work per hovered point.
    if (!sample) {
      sample = window.setTimeout(() => {
        sample = 0;
        trace();
      }, 85);
    }
  };
  const observer = new MutationObserver((records) => {
    if (
      records.some(
        ({ target, addedNodes, removedNodes }) =>
          (target instanceof Element &&
            (target.matches(`${line}, figcaption h2`) || target.closest(metricSelector))) ||
          [...addedNodes, ...removedNodes].some(
            (node) =>
              node instanceof Element &&
              (node.matches(`${figure}, ${line}, ${emptySelector}`) ||
                (node.tagName !== 'path' &&
                  Boolean(node.querySelector(`${figure}, ${line}, ${emptySelector}`)))),
          ),
      )
    )
      queue();
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['d'],
  });
  window.addEventListener('popstate', queue);
  reduce.addEventListener('change', clear);
  highContrast.addEventListener('change', clear);
  queue();
  return () => {
    observer.disconnect();
    window.removeEventListener('popstate', queue);
    reduce.removeEventListener('change', clear);
    highContrast.removeEventListener('change', clear);
    window.clearTimeout(sample);
    window.clearTimeout(finish);
    window.clearTimeout(metricTimer);
    clear();
    document
      .querySelectorAll(`.${emptyInk}, .${skeleton}, .${metricInk}`)
      .forEach((node) => node.remove());
  };
}
