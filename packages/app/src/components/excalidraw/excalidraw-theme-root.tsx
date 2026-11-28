'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '@/lib/i18n/use-locale';
import { usePathname } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ThemeHeaderToggles } from '@/components/effects/theme-header-toggles';
import { AUDIO_KEYS, createBoardAudio } from './board-audio';
import { mountBoardCharts } from './board-charts';
import { mountChartInk } from './board-chart-ink';
import { BoardLibrary } from './board-library';
import { type BoardStamp, readBoardStamp, SAVE_EVENT } from './board-stamp';
import { readStamps, stampNames, type Stamp } from './board-collection';
import { ExcalidrawThemeBanner } from './excalidraw-decorations';
import './excalidraw-theme.css';

// Keep this as a separate loader so Next does not emit a preload for the game
// when the theme or the desk is opened. Relay calls it only when rendered.
const loadRelay = () => import('./board-relay');
const Relay = dynamic(() => loadRelay(), { ssr: false });
const palettes = ['paper', 'vellum', 'blueprint'] as const;
type Palette = (typeof palettes)[number];
interface DeskSession {
  route: string;
  address: string;
  playing: boolean;
}

export default function ExcalidrawThemeRoot() {
  const zh = useLocale() === 'zh';
  const pathname = usePathname();
  const [audio] = useState(createBoardAudio);
  const [audible, setAudible] = useState(false);
  const [palette, setPalette] = useState<Palette>('paper');
  const [save, setSave] = useState<BoardStamp | null>(null);
  const [desk, setDesk] = useState<DeskSession | null>(null);
  const deskOpen = desk?.route === pathname;
  const playing = deskOpen && desk.playing;
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const t = (en: string, cn: string) => (zh ? cn : en);

  useEffect(() => {
    setDesk((current) => (current?.route === pathname ? current : null));
  }, [pathname]);

  useEffect(() => {
    // Browser Back may update the address before the new route finishes rendering.
    const closeOnBack = () => {
      const address = window.location.pathname;
      setDesk((current) => (current?.address === address ? current : null));
    };
    window.addEventListener('popstate', closeOnBack);
    return () => window.removeEventListener('popstate', closeOnBack);
  }, []);

  const earn = useCallback(
    (id: Stamp) => {
      const current = readStamps();
      if (current.includes(id)) return;
      const next = [...current, id];
      try {
        localStorage.setItem('excalidraw-desk-stamps', JSON.stringify(next));
      } catch {
        // The desk still works when storage is blocked.
      }
      setStamps(next);
      audio.cue('stamp');
    },
    [audio],
  );

  useEffect(() => {
    setAudible(Object.values(AUDIO_KEYS).some((key) => localStorage.getItem(key) === 'true'));
    setStamps(readStamps());
    const value = palettes.find((id) => id === localStorage.getItem('excalidraw-paper'));
    if (value) setPalette(value);
    setSave(readBoardStamp());
    const onSave = (event: Event) => {
      const result = (event as CustomEvent<BoardStamp>).detail;
      setSave(result);
      if (result.medals.some(Boolean)) earn('relay');
    };
    const press = (event: PointerEvent) => {
      audio.unlock();
      if (
        event.target instanceof Element &&
        event.target.closest('button, [role="tab"], [role="combobox"], [role="option"], a, label')
      )
        audio.cue('tap');
    };
    const enter = (event: PointerEvent) => {
      if (
        event.pointerType === 'mouse' &&
        event.target instanceof Element &&
        event.target.closest('button, a') &&
        !event.target.closest('.excalidraw-relay-node')
      )
        audio.cue('hover');
    };
    const key = (event: KeyboardEvent) => {
      if (event.repeat) return;
      audio.unlock();
      if (event.key === 'Enter' || event.key === ' ') audio.cue('tap');
    };
    window.addEventListener(SAVE_EVENT, onSave);
    window.addEventListener('pointerdown', press);
    window.addEventListener('pointerover', enter);
    window.addEventListener('keydown', key);
    document.addEventListener('visibilitychange', audio.sync);
    const cleanCharts = mountBoardCharts();
    const cleanInk = mountChartInk();
    return () => {
      window.removeEventListener(SAVE_EVENT, onSave);
      window.removeEventListener('pointerdown', press);
      window.removeEventListener('pointerover', enter);
      window.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', audio.sync);
      cleanCharts();
      cleanInk();
      audio.dispose();
    };
  }, [audio, earn]);

  useEffect(() => {
    document.documentElement.dataset.excalidrawPaper = palette;
    audio.scene(palette, pathname.includes('/infx'));
    return () => {
      delete document.documentElement.dataset.excalidrawPaper;
    };
  }, [audio, palette, pathname]);

  function toggle() {
    const next = !audible;
    for (const setting of Object.values(AUDIO_KEYS)) localStorage.setItem(setting, String(next));
    setAudible(next);
    audio.unlock();
    audio.sync();
    if (next) audio.cue('tap');
  }

  const controls = (
    <div
      className="excalidraw-board-toggles"
      role="group"
      aria-label={t('Whiteboard audio', '白板音频')}
    >
      <button
        type="button"
        aria-pressed={audible}
        onClick={toggle}
        title={t('Opt-in whiteboard and Relay sounds', '自选白板与中继音效')}
        data-testid="excalidraw-board-audio"
      >
        {t('Board audio', '白板音频')}
      </button>
    </div>
  );

  return (
    <>
      <ThemeHeaderToggles>{controls}</ThemeHeaderToggles>
      <ExcalidrawThemeBanner
        audio={audio}
        earn={earn}
        unlocked={stamps.length >= 8}
        stamps={stamps.length}
        totalStamps={Object.keys(stampNames).length}
        options={
          <>
            <div className="excalidraw-banner-tools">
              <div
                className="excalidraw-palette-chips"
                role="group"
                aria-label={t('Canvas', '画布')}
              >
                {palettes.map((value, index) => (
                  <button
                    key={value}
                    type="button"
                    data-paper={value}
                    aria-pressed={palette === value}
                    onClick={() => {
                      setPalette(value);
                      localStorage.setItem('excalidraw-paper', value);
                      audio.cue('paper');
                      if (value !== 'paper') earn('palette');
                    }}
                  >
                    {
                      [
                        t('Whiteboard', '白板'),
                        t('Vellum', '描图纸'),
                        t('Night blueprint', '夜间蓝图'),
                      ][index]
                    }
                  </button>
                ))}
              </div>
              {save &&
                (save.medals.some(Boolean) ||
                  save.best > 0 ||
                  save.blueprint.length > 0 ||
                  save.nodes.length > 0) && (
                  <span className="excalidraw-board-stamp">
                    {t('Stamped', '已盖章')}: {save.medals.filter(Boolean).length}/5
                    {save.best > 0 && ` · ${t('Best', '纪录')} ${save.best}`}
                    {(save.blueprint.length > 0 || save.nodes.length > 0) &&
                      ` · ${t('Blueprint saved', '蓝图已存')}`}
                  </span>
                )}
            </div>
            <div className="excalidraw-mobile-audio">{controls}</div>
            <details className="excalidraw-stamp-book" data-testid="excalidraw-stamp-book">
              <summary>
                {t('Sketchbook stamps', '草图册印章')} {stamps.length}/
                {Object.keys(stampNames).length}
              </summary>
              <ul>
                {(Object.keys(stampNames) as Stamp[]).map((id) => (
                  <li key={id} data-earned={stamps.includes(id)}>
                    <span aria-hidden="true">{stamps.includes(id) ? '✓' : '□'}</span>{' '}
                    {stampNames[id][zh ? 1 : 0]}
                  </li>
                ))}
              </ul>
              <p role="status">
                {stamps.length >= 8
                  ? t(
                      'Review stencil unlocked and pinned to the board.',
                      '评审模板已解锁并固定在白板。',
                    )
                  : t(
                      'Collect 8 marks to pin the review stencil.',
                      '收集 8 枚印章以固定评审模板。',
                    )}
              </p>
            </details>
          </>
        }
      >
        <BoardLibrary
          zh={zh}
          path={pathname}
          openRelay={() =>
            setDesk({ route: pathname, address: window.location.pathname, playing: false })
          }
          audio={audio}
          earn={earn}
        />
      </ExcalidrawThemeBanner>
      <Dialog
        open={deskOpen}
        onOpenChange={(open) => {
          if (!open) setDesk(null);
        }}
      >
        <DialogContent
          className={playing ? 'excalidraw-relay-dialog' : 'excalidraw-desk-dialog'}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document
              .querySelector<HTMLButtonElement>('.excalidraw-ip-open-relay')
              ?.focus({ preventScroll: true });
          }}
        >
          <DialogTitle>
            {playing
              ? t('Cluster Relay', '集群中继')
              : t('Whiteboard Relay desk', '白板中继工作台')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'Sketch a path for requests, then balance throughput, interactivity, and memory as the load changes.',
              '为请求绘制路径，随负载变化权衡吞吐、交互速率与显存。',
            )}
          </DialogDescription>
          {playing ? (
            <Relay zh={zh} audio={audio} audible={audible} toggleAudio={toggle} />
          ) : (
            <div className="excalidraw-desk-card">
              <img
                src="/decorative/excalidraw/architecture-strip.webp"
                alt=""
                width={798}
                height={134}
              />
              <p>
                {t(
                  'Five rooms, one cluster. Route the campaign, survive endless load, or save a Freehand blueprint.',
                  '五个房间，一个集群。完成布线战役、挑战无尽负载，或在沙盒中保存蓝图。',
                )}
              </p>
              <button
                type="button"
                onClick={() => {
                  audio.unlock();
                  audio.cue('route');
                  setDesk((current) => (current ? { ...current, playing: true } : current));
                }}
              >
                {t('Launch Cluster Relay', '启动集群中继')} →
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
