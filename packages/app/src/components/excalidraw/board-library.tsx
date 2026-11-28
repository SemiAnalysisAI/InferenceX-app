'use client';

import { ArrowUpRight, Command, MousePointer2, Shapes, SquareDashed } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BoardFlowchart } from './board-flowchart';
import {
  DeskLines,
  DeskTrail,
  deskStrings as strings,
  markTrail,
  useDeskLines,
} from './board-desk-journal';
import { mountChartSelection } from './board-selection';
import type { BoardAudio } from './board-audio';
import type { Stamp } from './board-collection';

const asset = (name: string) => `/decorative/excalidraw/${name}.webp`;

const tiles = [
  {
    file: 'architecture-db',
    title: ['One simple service', '一个简单服务'],
    copy: [
      'One simple service → router → prefill → KV cache → decode. The diagram has its own diagram.',
      '一个简单服务 → 路由 → 预填充 → KV 缓存 → 解码。连这张图都得再画一张图来解释。',
    ],
  },
  {
    file: 'stick-shrug',
    title: ['Stick-figure shrug', '火柴人耸肩'],
    copy: [
      'Batch size doubled. Throughput went up. TTFT? The stick figure is still waiting.',
      '批大小翻倍，吞吐提高了。首词元延迟呢？火柴人还在等。',
    ],
  },
  {
    file: 'storytelling',
    title: ['Storytelling', '对话气泡'],
    copy: [
      '“Have you tried adding another GPU?” asked the GPU waiting for a KV cache page.',
      '“试过再加一块 GPU 吗？”一块正在等 KV 缓存页的 GPU 问道。',
    ],
  },
  {
    file: 'imperfect-check',
    title: ['An imperfect check', '歪歪扭扭的对勾'],
    copy: [
      'Checked: more tokens per second does not always mean more tokens per second per user.',
      '已核对：每秒词元更多，并不一定意味着每个用户每秒拿到的词元更多。',
    ],
  },
  {
    file: 'mood-robot',
    title: ['Robots', '情绪机器人'],
    copy: [
      'The decode robot cheers when the cache hits. It would celebrate the miss too, but first it has to fetch.',
      '缓存命中，解码机器人欢呼。未命中也值得庆祝，不过得等它先去取数据。',
    ],
  },
  {
    file: 'despair',
    title: ['Despair', '绝望涂鸦'],
    copy: [
      'One more request, the KV cache spills. Rewind the sketch before you redraw the Pareto frontier.',
      '再来一条请求，KV 缓存就溢出了。重画帕累托前沿前，先撤回这一笔。',
    ],
  },
] as const;

type Panel = 'palette' | 'library' | 'help' | 'save' | 'flow' | null;
const workspaces = [
  ['blank', 'Blank canvas', '空白画布'],
  ['system', 'System design', '系统设计'],
  ['wireframe', 'Wireframe', '线框图'],
  ['brainstorm', 'Brainstorm', '头脑风暴'],
] as const;
type Workspace = (typeof workspaces)[number][0];
interface Tile {
  file: string;
  title: readonly [string, string];
  copy: readonly [string, string];
}
const gopher: Tile = {
  file: 'gopher',
  title: ['Golang gopher', 'Go 地鼠'],
  copy: [
    'The gopher found an extra cache layer. It was a folder named “final-final”.',
    '地鼠发现了额外一层缓存。原来是名叫“最终版-真的最终版”的文件夹。',
  ],
};
const spelling: Tile = {
  file: 'imperfect-check',
  title: ['Excalidraw, spelled correctly', 'Excalidraw，这次拼对了'],
  copy: [
    'Excalidraw, not Excalidrawr. One extra R and the roughness setting gets out of hand.',
    '是 Excalidraw，不是 Excalidrawr。多写一个 R，线条就粗糙得收不住了。',
  ],
};

function download(href: string, filename: string) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
}

export function BoardLibrary({
  zh,
  path,
  openRelay,
  audio,
  earn,
}: {
  zh: boolean;
  path: string;
  openRelay: () => void;
  audio: BoardAudio;
  earn: (id: Stamp) => void;
}) {
  const l = (pair: readonly [string, string]) => pair[zh ? 1 : 0];
  const [panel, setPanel] = useState<Panel>(null);
  const [query, setQuery] = useState('');
  const [tile, setTile] = useState<Tile | null>(null);
  const [armed, setArmed] = useState(false);
  const [status, setStatus] = useState('');
  const [workspace, setWorkspace] = useState<Workspace>('blank');
  const [placements, setPlacements] = useState<Partial<Record<Workspace, Tile>>>({});
  const paletteButton = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const selection = useRef<ReturnType<typeof mountChartSelection> | null>(null);
  const board = useRef<HTMLElement>(null);
  const { caption, found, emit } = useDeskLines();

  useEffect(() => {
    const guide = mountChartSelection(zh, (observation) => {
      setArmed(false);
      setStatus('');
      earn('chart');
      audio.cue('mark');
      markTrail(observation);
    });
    selection.current = guide;
    return () => {
      guide.dispose();
      selection.current = null;
    };
  }, [zh, audio, earn]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === '/') {
        if (document.querySelector('[role="dialog"][data-state="open"]')) return;
        event.preventDefault();
        setQuery('');
        setPanel('palette');
        emit('palette');
      } else if (event.key === 'Escape' && board.current?.contains(document.activeElement)) {
        setPanel(null);
        setArmed(false);
        selection.current?.arm(false);
        setStatus('');
        paletteButton.current?.focus();
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [emit]);

  useEffect(() => {
    if (panel === 'palette') search.current?.focus();
  }, [panel]);

  const label = (id: keyof typeof strings) => (zh && id === 'library' ? '素材库' : l(strings[id]));

  function open(next: Panel) {
    setQuery('');
    setPanel(panel === next ? null : next);
    if (panel !== next && (next === 'palette' || next === 'help')) emit(next);
  }

  function choose(item: Tile) {
    setTile(item);
    setStatus('');
    audio.cue('pick');
    earn('library');
  }

  function place(item: Tile) {
    choose(item);
    setPlacements((current) => ({ ...current, [workspace]: item }));
    emit('library');
    audio.cue('drop');
    earn('place');
  }

  function reset() {
    setPlacements({});
    setWorkspace('blank');
    setTile(null);
    setArmed(false);
    setPanel(null);
    selection.current?.clear();
    setStatus('');
    emit('reset');
    paletteButton.current?.focus();
  }

  function discover() {
    const word = query.trim().toLowerCase();
    const item =
      word === 'gopher' || word === '地鼠' ? gopher : word === 'excalidrawr' ? spelling : null;
    if (!item) return;
    const model = document.querySelector('[data-testid="model-selector"]')?.textContent?.trim();
    const metric = document
      .querySelector('[data-testid="yaxis-metric-selector"]')
      ?.textContent?.trim();
    const copy: [string, string] | undefined =
      item === gopher && model
        ? [
            `The Go gopher went looking for ${model}’s KV cache. It found a folder called “final-final”.`,
            `Go 地鼠去找 ${model} 的 KV 缓存，却只找到一个叫「最终版-真的最终版」的文件夹。`,
          ]
        : item === spelling && metric
          ? [
              `Excalidraw, not Excalidrawr. One more R still won’t improve ${metric.toLocaleLowerCase()}.`,
              `是 Excalidraw，不是 Excalidrawr。多写一个 R，${metric} 也不会变好。`,
            ]
          : undefined;
    choose(copy ? { ...item, copy } : item);
    earn('secret');
    setPanel(null);
    paletteButton.current?.focus();
  }

  function armChart() {
    const active = !armed;
    setPanel(null);
    setArmed(active);
    selection.current?.arm(active);
    if (active) {
      setStatus(
        l([
          'Select a plotted point to add a sketch note. Plot values and colors stay unchanged.',
          '选择一个图中数据点以添加草图便签。数值和颜色不会改变。',
        ]),
      );
    } else setStatus('');
  }

  function save() {
    const file = new Blob(
      [
        JSON.stringify(
          { type: 'inferencex-whiteboard-note', title: tile?.title, note: tile?.copy },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const uri = URL.createObjectURL(file);
    download(uri, 'whiteboard-note.json');
    window.setTimeout(() => URL.revokeObjectURL(uri), 1000);
    setStatus(l(['Note saved to disk.', '便签已保存到磁盘。']));
    emit('save');
  }

  function exportImage() {
    if (!tile) return;
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 420;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = new Image();
    image.addEventListener(
      'load',
      () => {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, 640, 420);
        const height = 180;
        const width = height * (image.width / image.height);
        ctx.drawImage(image, (640 - width) / 2, 30, width, height);
        ctx.fillStyle = '#1e1e1e';
        ctx.font = '28px Virgil, sans-serif';
        ctx.fillText(l(tile.title), 38, 256);
        ctx.font = '20px Excalifont, sans-serif';
        const parts = zh ? [...l(tile.copy)] : (l(tile.copy).match(/\S+\s*/gu) ?? []);
        let line = '';
        let y = 301;
        for (const part of parts) {
          if (line && ctx.measureText(line + part).width > 564) {
            ctx.fillText(line.trimEnd(), 38, y);
            line = '';
            y += 30;
          }
          line += part;
        }
        ctx.fillText(line.trimEnd(), 38, y);
        download(canvas.toDataURL('image/png'), 'whiteboard-note.png');
        setStatus(l(['Note exported as an image.', '便签已导出为图片。']));
        emit('export');
      },
      { once: true },
    );
    image.src = asset(tile.file);
  }

  const chartLabel = l(['Mark a chart point', '标注图表数据点']);
  const openDesk = () => {
    emit('open');
    openRelay();
  };
  const commands = [
    [
      label('open'),
      () => {
        setPanel(null);
        openDesk();
      },
    ],
    [label('library'), () => open('library')],
    [l(['Sketch a flowchart', '绘制流程图']), () => open('flow')],
    [chartLabel, armChart],
    [label('save'), () => open('save')],
    [label('export'), exportImage],
    [label('reset'), reset],
    [label('help'), () => open('help')],
  ] as const;

  return (
    <section
      ref={board}
      className="excalidraw-ip-workbench"
      aria-label={l(['Sketch desk', '草图工作台'])}
    >
      <div className="excalidraw-ip-island" role="group" aria-label={l(['Tools', '工具'])}>
        <button
          ref={paletteButton}
          type="button"
          aria-label={label('palette')}
          aria-expanded={panel === 'palette'}
          onClick={() => open('palette')}
        >
          <Command aria-hidden="true" /> <span>{label('palette')}</span>
        </button>
        <button
          type="button"
          aria-label={label('library')}
          aria-expanded={panel === 'library'}
          onClick={() => open('library')}
        >
          <span aria-hidden="true" className="excalidraw-ip-icon" data-icon="library" />
          <span>{label('library')}</span>
        </button>
        <button
          type="button"
          aria-label={l(['Flowchart', '流程图'])}
          aria-expanded={panel === 'flow'}
          data-desk-tool="flow"
          onClick={() => open('flow')}
        >
          <Shapes aria-hidden="true" /> <span>{l(['Flowchart', '流程图'])}</span>
        </button>
        <button
          type="button"
          aria-label={chartLabel}
          aria-pressed={armed}
          data-desk-tool="chart"
          onClick={armChart}
        >
          <SquareDashed aria-hidden="true" /> <span>{chartLabel}</span>
        </button>
        <button
          type="button"
          className="excalidraw-ip-open-relay"
          aria-label={l(['Open Relay desk', '打开中继工作台'])}
          aria-haspopup="dialog"
          onClick={openDesk}
        >
          <span aria-hidden="true" className="excalidraw-ip-icon" data-icon="open" />
          <span>{l(['Relay desk', '中继工作台'])}</span>
        </button>
      </div>
      <div className="excalidraw-desk-notes">
        <DeskLines caption={caption} found={found} zh={zh} />
        <DeskTrail path={path} zh={zh} />
      </div>
      {panel === 'palette' && (
        <div className="excalidraw-ip-panel">
          <label>
            {label('palette')}
            <input
              ref={search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') discover();
              }}
            />
          </label>
          <div className="excalidraw-ip-actions">
            {commands
              .filter(([name]) => name.toLowerCase().includes(query.toLowerCase()))
              .map(([name, action]) => (
                <button
                  key={name}
                  type="button"
                  disabled={name === label('export') && !tile}
                  onClick={action}
                >
                  {name}
                </button>
              ))}
          </div>
        </div>
      )}
      {panel === 'library' && (
        <div className="excalidraw-ip-panel">
          <strong>{label('library')}</strong>
          <p>
            {l([
              'Drag or select a sketch to place it on this canvas.',
              '将草图拖入画布，或点击选中以放置。',
            ])}
          </p>
          <div className="excalidraw-ip-tiles">
            {tiles.map((item) => (
              <button
                key={item.file}
                type="button"
                aria-pressed={tile === item}
                onClick={() => place(item)}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/x-excalidraw-library-tile', item.file);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
              >
                <img alt="" src={asset(item.file)} width={64} height={64} />
                {l(item.title)}
              </button>
            ))}
          </div>
          <div
            className="excalidraw-ip-actions"
            role="group"
            aria-label={l(['Workspaces', '工作区'])}
          >
            {workspaces.map(([id, en, cn]) => (
              <button
                key={id}
                type="button"
                aria-pressed={workspace === id}
                onClick={() => setWorkspace(id)}
              >
                {l([en, cn])}
              </button>
            ))}
          </div>
          <div
            className="excalidraw-ip-drop excalidraw-ip-workspace"
            data-workspace={workspace}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes('application/x-excalidraw-library-tile'))
                event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              const item = tiles.find(
                ({ file }) =>
                  file === event.dataTransfer.getData('application/x-excalidraw-library-tile'),
              );
              if (!item) return;
              place(item);
            }}
          >
            {workspace === 'system' && (
              <div className="excalidraw-workspace-art excalidraw-workspace-system">
                <img
                  src={asset('architecture-strip')}
                  alt={l(['Hand-drawn server, container and database', '手绘服务器、容器与数据库'])}
                  width={500}
                  height={120}
                  draggable={false}
                />
                <span>
                  {l(['Route → Prefill → Cache → Decode', '路由 → 预填充 → 缓存 → 解码'])}
                </span>
              </div>
            )}
            {workspace === 'wireframe' && (
              <div className="excalidraw-workspace-art">
                <img
                  src={asset('workspace-wireframes')}
                  alt={l([
                    'Two sketched browser layouts with navigation and content blocks',
                    '两张带导航和内容块的手绘浏览器布局',
                  ])}
                  width={560}
                  height={168}
                  draggable={false}
                />
                <span>{l(['Layout → Interaction', '布局 → 交互'])}</span>
              </div>
            )}
            {workspace === 'brainstorm' && (
              <div className="excalidraw-workspace-sticky">
                {(
                  [
                    ['sticky', 'What changes?', '有什么变化？'],
                    ['workspace-note-rose', 'What breaks?', '哪里会出错？'],
                    ['workspace-note-mint', 'What do we test?', '接下来测什么？'],
                  ] as const
                ).map(([file, en, cn]) => (
                  <div key={file}>
                    <img src={asset(file)} alt="" width={120} height={120} draggable={false} />
                    <span>{l([en, cn])}</span>
                  </div>
                ))}
              </div>
            )}
            {placements[workspace] ? (
              <div className="excalidraw-workspace-placement" role="status">
                <img
                  src={asset(placements[workspace].file)}
                  alt=""
                  width={52}
                  height={52}
                  draggable={false}
                />
                {l(placements[workspace].title)}
              </div>
            ) : (
              <span>{l(['Drop on this sketch', '拖入此草图'])}</span>
            )}
            <span className="excalidraw-cursor">
              <MousePointer2 aria-hidden="true" /> {l(['You · local', '你 · 本机'])}
            </span>
          </div>
        </div>
      )}
      {panel === 'help' && (
        <div className="excalidraw-ip-panel">
          <strong>{label('help')}</strong>
          <details
            onToggle={(event) => {
              if (event.currentTarget.open) emit('shortcuts');
            }}
          >
            <summary>{label('shortcuts')}</summary>
            <p>
              <kbd>Ctrl / ⌘ + /</kbd> {label('palette')} · <kbd>Esc</kbd>{' '}
              {l(['Close panel', '关闭面板'])}
            </p>
          </details>
          <p>
            {label('collaboration')} ·{' '}
            {l([
              'This sketch is local; no remote cursors are connected.',
              '这张草图仅在本机使用，未连接协作者。',
            ])}{' '}
            <a
              href="https://plus.excalidraw.com/"
              target="_blank"
              rel="noreferrer"
              onClick={() => emit('plus')}
            >
              {label('plus')}
            </a>
          </p>
        </div>
      )}
      {panel === 'flow' && <BoardFlowchart zh={zh} audio={audio} earn={earn} />}
      {panel === 'save' && (
        <div className="excalidraw-ip-panel">
          <button type="button" disabled={!tile} onClick={save}>
            {l(['Save to disk', '保存到磁盘'])}
          </button>
          <button type="button" disabled={!tile} onClick={exportImage}>
            {label('export')}
          </button>
        </div>
      )}
      {tile && (
        <div className="excalidraw-ip-note" role="status">
          <img alt="" src={asset(tile.file)} width={76} height={76} />
          <div>
            <strong>{l(tile.title)}</strong>
            <p>{l(tile.copy)}</p>
          </div>
          <button
            type="button"
            onClick={() => open('save')}
            aria-label={label('save')}
            title={label('save')}
          >
            <ArrowUpRight aria-hidden="true" />
          </button>
        </div>
      )}
      {status && (
        <p className="excalidraw-ip-status" role="status">
          {status}
        </p>
      )}
      {armed && (
        <button
          className="excalidraw-ip-keymark"
          type="button"
          onClick={() => {
            if (!selection.current?.first())
              setStatus(l(['No plotted point is available.', '还没有可标注的数据点。']));
          }}
        >
          <span aria-hidden="true" className="excalidraw-ip-icon" data-icon="select" />{' '}
          {l(['Mark the first available point', '标注第一个可用的数据点'])}
        </button>
      )}
    </section>
  );
}
