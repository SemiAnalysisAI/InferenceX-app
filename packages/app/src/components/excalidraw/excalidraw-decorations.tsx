'use client';

import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/lib/i18n/use-locale';
import { architectureNotes } from './board-notes';
import type { BoardAudio } from './board-audio';
import type { Stamp } from './board-collection';
import { bannerRect, bannerUnderline, type SketchPath } from './sketch-shapes';

function Sketch({ paths }: { paths: SketchPath[] }) {
  return paths.map((path, index) => (
    <path
      key={index}
      d={path.d}
      stroke={path.stroke}
      strokeWidth={path.strokeWidth}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ));
}

export function ExcalidrawThemeBanner({
  children,
  options,
  stamps,
  totalStamps,
  audio,
  earn,
  unlocked,
}: {
  children?: ReactNode;
  options: ReactNode;
  stamps: number;
  totalStamps: number;
  audio: BoardAudio;
  earn: (id: Stamp) => void;
  unlocked: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const locale = useLocale();
  const pathname = usePathname();
  const compact = pathname !== '/' && pathname !== '/zh' && pathname !== '/zh/';
  const [mounted, setMounted] = useState(false);
  const [note, setNote] = useState(-1);
  const zh = locale === 'zh';
  useEffect(() => setMounted(true), []);
  if (!mounted || resolvedTheme !== 'excalidraw') return null;

  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="excalidraw-theme-banner">
      <div className="excalidraw-theme-banner" data-compact={compact}>
        <div className="excalidraw-banner-mark">
          <svg viewBox="0 0 240 56" aria-hidden="true" className="excalidraw-banner-frame">
            <Sketch paths={bannerRect} />
            <Sketch paths={bannerUnderline} />
          </svg>
          <p className="excalidraw-wordmark">
            <img src="/decorative/excalidraw/editor-mark.webp" alt="" width={30} height={30} />
            InferenceX
          </p>
        </div>
        <div className="excalidraw-banner-copy">
          <strong>{locale === 'zh' ? '白板实验室' : 'The Whiteboard Lab'}</strong>
          <p className="excalidraw-tagline">
            {locale === 'zh'
              ? '白板模式 · 基准测试，手绘风格'
              : 'Whiteboard mode · benchmarks, sketched by hand'}
          </p>
        </div>
        {!compact && <WelcomeBoard zh={zh} audio={audio} earn={earn} unlocked={unlocked} />}
        <details className="excalidraw-desk-options" data-testid="excalidraw-desk-options">
          <summary
            aria-label={zh ? '白板选项' : 'Board options'}
            aria-controls="excalidraw-desk-panel"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16M9 3v6m6 0v6m-7 0v6" />
            </svg>
            <span aria-hidden="true">
              {stamps}/{totalStamps}
            </span>
          </summary>
        </details>
        <div className="excalidraw-options-panel" id="excalidraw-desk-panel">
          <button
            type="button"
            className="excalidraw-note-doodle"
            aria-label={zh ? '翻看下一张架构便签' : 'Flip to the next architecture note'}
            title={zh ? '架构便签' : 'Architecture notes'}
            onClick={() => {
              setNote((value) => (value + 1) % architectureNotes.length);
              audio.cue('flip');
              earn('note');
            }}
          >
            <svg
              viewBox="0 0 29 28"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            >
              <path d="M5 4l20-1-1 14-7 7-13 1zM17 24l1-8 6 1M8 9l12-1m-12 5 9-1" />
              <path d="M1 4l2 2M27 0l-1 3" />
            </svg>
          </button>
          {options}
          {note >= 0 && (
            <div className="excalidraw-architecture-note">
              <span role="status">
                {String(note + 1).padStart(2, '0')}/{architectureNotes.length} ·{' '}
                {architectureNotes[note][zh ? 1 : 0]}
              </span>
              <button
                type="button"
                onClick={() => setNote(-1)}
                aria-label={zh ? '关闭便签' : 'Close architecture note'}
              >
                ×
              </button>
            </div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function inkPoint(event: PointerEvent<SVGSVGElement>) {
  const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
  const x = Math.min(600, Math.max(0, (600 * (event.clientX - left)) / (width || 1)));
  const y = Math.min(130, Math.max(0, (130 * (event.clientY - top)) / (height || 1)));
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
}

function WelcomeBoard({
  zh,
  audio,
  earn,
  unlocked,
}: {
  zh: boolean;
  audio: BoardAudio;
  earn: (id: Stamp) => void;
  unlocked: boolean;
}) {
  const t = (en: string, cn: string) => (zh ? cn : en);
  const [tool, setTool] = useState(0);
  const [figuresOpen, setFiguresOpen] = useState(false);
  const [poses, setPoses] = useState([0, 0]);
  const [greeted, setGreeted] = useState(0);
  const [ink, setInk] = useState<string[]>([]);
  const pen = useRef<{ pointer: number; points: number } | null>(null);
  const posesCopy = [
    [
      t('Waiting for tokens', '等待词元'),
      t('One more run?', '再跑一次？'),
      t('Frontier found!', '找到前沿了！'),
    ],
    [t('Cache cold', '冷缓存'), t('Warming up…', '预热中…'), t('Cache hit!', '缓存命中！')],
  ];
  const tools = [
    [t('Select', '选择'), 'M5 3l14 9-7 1-3 7z'],
    [t('Arrow', '箭头'), 'M4 17Q10 12 19 6m-7 0h7v7'],
    [t('Draw', '手绘'), 'M4 18l2-6L17 3l4 4-11 10z'],
  ];
  return (
    <section
      className="excalidraw-welcome-sketch"
      data-tool={tool}
      data-unlocked={unlocked}
      aria-label={t('Interactive architecture whiteboard', '互动架构白板')}
    >
      <ExcalidrawDecorations />
      <div
        className="excalidraw-welcome-tools"
        role="group"
        aria-label={t('Sketch tools', '草图工具')}
      >
        {tools.map(([label, path], i) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={tool === i}
            onClick={() => {
              setTool(i);
              setPoses([i, i]);
              audio.cue(i === 2 ? 'pencil' : i === 1 ? 'wire' : 'pick');
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={path} />
            </svg>
          </button>
        ))}
        <button
          type="button"
          className="excalidraw-welcome-show-figures"
          aria-expanded={figuresOpen}
          aria-controls="excalidraw-welcome-figures"
          aria-label={t('Library figures', '素材库角色')}
          title={t('Library figures', '素材库角色')}
          onClick={() => setFiguresOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 10Q3 2 11 2q8 0 6 6-2 4-9 2m3 1-1 5m-6-4 6 4 7-5m-7 5-5 6m5-6 5 6" />
          </svg>
        </button>
      </div>
      <div className="excalidraw-welcome-idea">
        <span>{t('Architecture sketch / 01', '架构草图 / 01')}</span>
        <strong>{t('From prompt to tokens', '从提示到词元')}</strong>
      </div>
      <div className="excalidraw-welcome-nodes">
        <div className="excalidraw-welcome-node">
          <img src="/decorative/excalidraw/wireframe.webp" alt="" width={80} height={84} />
          <span>{t('Prompt', '提示')}</span>
        </div>
        <svg className="excalidraw-welcome-link" viewBox="0 0 90 44" aria-hidden="true">
          <path d="M2 30Q36-1 83 19m-14-12 16 12-15 9M4 32Q33 3 80 21" />
        </svg>
        <div className="excalidraw-welcome-node" data-node="cache">
          <img src="/decorative/excalidraw/architecture-db.webp" alt="" width={80} height={80} />
          <span>{t('KV cache', 'KV 缓存')}</span>
        </div>
        <svg className="excalidraw-welcome-link" viewBox="0 0 90 44" aria-hidden="true">
          <path d="M3 16q44 25 81 7m-14-6 16 5-13 11M6 15q39 21 74 9" />
        </svg>
        <div className="excalidraw-welcome-node" data-node="tokens">
          <img src="/decorative/excalidraw/sticky.webp" alt="" width={80} height={80} />
          <span>{t('Tokens', '词元')}</span>
        </div>
        <svg
          className="excalidraw-welcome-ink"
          viewBox="0 0 600 130"
          preserveAspectRatio="none"
          aria-hidden="true"
          onPointerDown={(event) => {
            if (tool !== 2 || event.button !== 0 || pen.current) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            pen.current = { pointer: event.pointerId, points: 1 };
            const xy = inkPoint(event);
            setInk((lines) => [...lines.slice(-11), `M ${xy} l 0.1 0 L ${xy}`]);
            audio.cue('pencil');
          }}
          onPointerMove={(event) => {
            if (pen.current?.pointer !== event.pointerId || pen.current.points >= 360) return;
            pen.current.points++;
            const xy = inkPoint(event);
            setInk((lines) => [...lines.slice(0, -1), `${lines.at(-1)} L ${xy}`]);
          }}
          onLostPointerCapture={() => {
            pen.current = null;
          }}
        >
          {ink.map((line, index) => (
            <path key={index} d={line} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>
      <div
        id="excalidraw-welcome-figures"
        className="excalidraw-welcome-figures"
        data-open={figuresOpen}
      >
        {['stick-shrug', 'mood-robot'].map((item, i) => (
          <button
            key={item}
            type="button"
            data-pose={poses[i]}
            data-testid={`excalidraw-${item}`}
            aria-label={
              i === 0
                ? t('Greet the stick figure', '问候火柴人')
                : t('Greet the robot', '问候机器人')
            }
            onClick={() => {
              setPoses(poses.map((pose, j) => (j === i ? (pose + 1) % 3 : pose)));
              const next = greeted | (1 << i);
              setGreeted(next);
              if (next === 3) earn('figure');
              audio.cue('pencil');
            }}
          >
            <img src={`/decorative/excalidraw/${item}.webp`} alt="" width={72} height={72} />
            <span aria-live="polite">{posesCopy[i][poses[i]]}</span>
          </button>
        ))}
      </div>
      {tool === 2 && (
        <div className="excalidraw-welcome-ink-controls">
          <button
            type="button"
            onClick={() => {
              setInk((lines) => [...lines.slice(-11), 'M390 97q14 16 28 9 15-10 35-52']);
              audio.cue('pencil');
            }}
          >
            {t('Add check mark', '添加对勾')}
          </button>
          <button
            type="button"
            disabled={ink.length === 0}
            onClick={() => setInk((lines) => lines.slice(0, -1))}
          >
            {t('Undo ink', '撤销笔迹')}
          </button>
        </div>
      )}
      {unlocked && (
        <div className="excalidraw-review-stencil" data-testid="excalidraw-review-stencil">
          <img src="/decorative/excalidraw/imperfect-check.webp" alt="" width={30} height={30} />
          <span>{t('Review stencil', '评审模板')}</span>
        </div>
      )}
    </section>
  );
}

function ExcalidrawDecorations() {
  const scene = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const paint = () => {
      frame = 0;
      scene.current?.style.setProperty(
        '--excalidraw-scroll',
        `${motion.matches ? 0 : Math.min(48, window.scrollY * 0.075)}px`,
      );
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener('scroll', queue, { passive: true });
    motion.addEventListener('change', queue);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', queue);
      motion.removeEventListener('change', queue);
    };
  }, []);

  return (
    <div ref={scene} className="excalidraw-scene" data-testid="excalidraw-scene" aria-hidden="true">
      <svg
        className="excalidraw-scene-ink"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 694 Q72 650 107 703 T195 716 M178 703l17 13-20 9 M29 702Q70 658 107 710" />
          <path d="M1238 167l132-8 18 100-139 10z M1245 173l119-8 15 89-125 11z M1264 194l86-7 M1269 211l62-6 M1276 230l78-9" />
          <path d="M1336 768q43 17 64-51 M1385 730l15-13 7 20 M44 198l34 7 M60 185l4 34" />
        </g>
      </svg>
    </div>
  );
}
