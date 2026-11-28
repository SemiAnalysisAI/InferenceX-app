'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const deskStrings = {
  palette: ['Command palette', '命令面板'],
  library: ['Libraries', '浏览素材库'],
  open: ['Open', '打开'],
  export: ['Export image', '导出图片'],
  save: ['Save to', '保存到...'],
  reset: ['Reset the canvas', '重置画布'],
  help: ['Help', '帮助'],
  shortcuts: ['Keyboard shortcuts', '快捷键列表'],
  plus: ['Excalidraw+', 'Excalidraw+'],
  collaboration: ['Live collaboration', '实时协作'],
} as const;
const journalCount = Object.keys(deskStrings).length - 1; // This board makes no collaboration claim.

type DeskLine = keyof typeof deskStrings;
const shelf = 'excalidraw-desk-journal';
const trail = 'excalidraw-tracing-trail';
const tracingNote = 'excalidraw-traced-observation';
const chart = '/infx/inference?g_model=DeepSeek-R1-0528';

export function useDeskLines() {
  const [found, setFound] = useState<DeskLine[]>([]);
  const [caption, setCaption] = useState<DeskLine | null>(null);
  const times = useRef<Partial<Record<DeskLine, number>>>({});
  const timeout = useRef(0);
  const emit = useCallback((id: DeskLine) => {
    const now = Date.now();
    const cadenceLabel = `${shelf}-${id}`;
    let last = times.current[id] ?? 0;
    try {
      last = Math.max(last, Number(sessionStorage.getItem(cadenceLabel)) || 0);
    } catch {}
    if (now - last < 20_000) return;
    times.current[id] = now;
    try {
      sessionStorage.setItem(cadenceLabel, String(now));
    } catch {}
    setCaption(id);
    setFound((previous) => (previous.includes(id) ? previous : [...previous, id]));
    window.clearTimeout(timeout.current);
    timeout.current = window.setTimeout(() => setCaption(null), 4750);
  }, []);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(shelf) ?? '[]');
      if (Array.isArray(saved)) setFound(saved.filter((id) => Object.hasOwn(deskStrings, id)));
    } catch {}
    return () => {
      window.clearTimeout(timeout.current);
    };
  }, [emit]);
  useEffect(() => {
    if (found.length > 0) {
      try {
        sessionStorage.setItem(shelf, JSON.stringify(found));
      } catch {}
    }
  }, [found]);
  return { caption, found, emit };
}

function Line({ id }: { id: DeskLine }) {
  return (
    <>
      <span lang="en">{deskStrings[id][0]}</span>
      {' · '}
      <span lang="zh">{deskStrings[id][1]}</span>
    </>
  );
}

export function DeskLines({
  caption,
  found,
  zh,
}: {
  caption: DeskLine | null;
  found: DeskLine[];
  zh: boolean;
}) {
  return (
    <>
      {caption && (
        <p className="excalidraw-desk-caption" data-desk-line={caption} role="status">
          <Line id={caption} />
        </p>
      )}
      <details className="excalidraw-desk-journal">
        <summary>
          {zh ? '工具语录手记' : 'Tool journal'} · {found.length}/{journalCount}
        </summary>
        <ul>
          {found.map((id) => (
            <li key={id}>
              <Line id={id} />
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

function getTrail() {
  try {
    return sessionStorage.getItem(trail) ?? '';
  } catch {
    return '';
  }
}
function advanceTrail(step: string) {
  try {
    sessionStorage.setItem(trail, step);
  } catch {
    return;
  }
  window.dispatchEvent(new Event(trail));
}

export function markTrail(observation: string) {
  if (getTrail() !== 'look') return;
  try {
    sessionStorage.setItem(tracingNote, observation);
  } catch {}
  advanceTrail('marked');
}

export function DeskTrail({ path, zh }: { path: string; zh: boolean }) {
  const [step, setStep] = useState('');
  const [observation, setObservation] = useState('');
  const here = path.replace(/^\/zh(?=\/|$)/, '') || '/';
  const root = zh ? '/zh' : '';
  useEffect(() => {
    const refresh = () => {
      const current = getTrail();
      if (current === 'marked' && here === '/about') {
        advanceTrail('read');
      } else {
        setStep(current);
        if (current === 'read') {
          try {
            setObservation(sessionStorage.getItem(tracingNote) ?? '');
          } catch {}
        }
      }
    };
    window.addEventListener(trail, refresh);
    refresh();
    return () => window.removeEventListener(trail, refresh);
  }, [here]);

  if (here === '/')
    return (
      <p className="excalidraw-tracing-trail" data-tracing="clue">
        <a
          href={`${root}${chart}`}
          onClick={() => {
            if (!getTrail()) advanceTrail('look');
          }}
        >
          {zh ? '描图纸 ①：标注真实数据点' : 'Tracing paper ①: mark a real point'}
        </a>
      </p>
    );
  if (here === '/infx/inference' && (step === 'look' || step === 'marked'))
    return (
      <p className="excalidraw-tracing-trail" data-tracing={step}>
        {step === 'look' ? (
          zh ? (
            '② 选「标注图表数据点」，然后选一个真实数据点。'
          ) : (
            '② Choose “Mark a chart point”, then select a real mark.'
          )
        ) : (
          <a href={`${root}/about`}>
            {zh ? '③ 去「关于」翻到描图纸背面' : '③ Turn over the tracing paper on About'}
          </a>
        )}
      </p>
    );
  if (here === '/about' && step === 'read')
    return (
      <aside className="excalidraw-tracing-trail excalidraw-tracing-payoff" data-tracing="read">
        <img src="/decorative/excalidraw/storytelling.webp" alt="" width={62} height={54} />
        <div>
          <strong>
            {zh ? '描图纸的背面：排队画得出来' : 'Reverse of the tracing paper: the queue is real'}
          </strong>
          <p>
            {zh
              ? `「你画的是${observation || '刚才那个点'}的吞吐？」 「我画的是那个等首词元的请求。它终于等到自己的那一格了。」`
              : `“You drew throughput for ${observation || 'that measurement'}?” “I drew the request waiting for its first token. It finally got its own box.”`}
          </p>
        </div>
      </aside>
    );
  return null;
}
