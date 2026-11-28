'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import type { BoardAudio } from './board-audio';
import type { Stamp } from './board-collection';

const ideas = [
  ['Prefill', '预填充'],
  ['KV cache', 'KV 缓存'],
  ['Decode', '解码'],
] as const;
const shapes = ['rectangle', 'ellipse', 'diamond'] as const;
interface Node {
  text: string;
  shape: number;
}

export function BoardFlowchart({
  zh,
  audio,
  earn,
}: {
  zh: boolean;
  audio: BoardAudio;
  earn: (id: Stamp) => void;
}) {
  const t = (en: string, cn: string) => (zh ? cn : en);
  const [nodes, setNodes] = useState([{ text: t(...ideas[0]), shape: 0 }]);
  const [current, setCurrent] = useState(0);
  const [editing, setEditing] = useState(false);
  const [ink, setInk] = useState('violet');
  const [fill, setFill] = useState(false);
  const [rough, setRough] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [past, setPast] = useState<Node[][]>([]);
  const [future, setFuture] = useState<Node[][]>([]);
  const focus = useRef(new Map<number, HTMLButtonElement>());
  const edit = useRef<HTMLInputElement>(null);
  const originalLabel = useRef('');

  useEffect(() => {
    if (editing) edit.current?.focus();
  }, [editing]);

  function change(next: Node[]) {
    setPast((stack) => [...stack.slice(-19), nodes]);
    setFuture([]);
    setNodes(next);
  }

  function restore(redo = false) {
    const stack = redo ? future : past;
    const next = stack.at(-1);
    if (!next) return;
    if (redo) {
      setFuture(stack.slice(0, -1));
      setPast([...past, nodes]);
    } else {
      setPast(stack.slice(0, -1));
      setFuture([...future, nodes]);
    }
    setEditing(false);
    setNodes(next);
    setCurrent(Math.min(current, next.length - 1));
  }

  function add() {
    if (nodes.length >= ideas.length) return;
    const index = nodes.length;
    const [en, cn] = ideas[index];
    change([...nodes, { text: t(en, cn), shape: 0 }]);
    audio.cue('wire');
    earn('flow');
    setCurrent(index);
    requestAnimationFrame(() => focus.current.get(index)?.focus());
  }

  function finishLabel() {
    setEditing(false);
    if (nodes[current]?.text.trim() && nodes[current]?.text !== originalLabel.current) {
      audio.cue('pencil');
      earn('text');
    }
  }

  function bump() {
    change(
      nodes.map((node, i) =>
        i === current ? { ...node, shape: (node.shape + 1) % shapes.length } : node,
      ),
    );
  }

  return (
    <div
      className="excalidraw-ip-panel"
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'ArrowRight' && !editing) {
          event.preventDefault();
          add();
        }
      }}
    >
      <strong>{t('Sketch a flowchart', '绘制流程图')}</strong>
      <p>
        {t(
          'Enter edits a label. Ctrl / ⌘ + → connects a node. Ctrl / ⌘ + Tab cycles its shape.',
          'Enter 编辑标签，Ctrl / ⌘ + → 连接节点，Ctrl / ⌘ + Tab 切换形状。',
        )}
      </p>
      <div className="excalidraw-editor">
        <fieldset className="excalidraw-properties">
          <legend>{t('Properties', '属性')}</legend>
          <label>
            {t('Stroke', '描边')}
            <select value={ink} onChange={(event) => setInk(event.target.value)}>
              <option value="violet">{t('Violet', '紫色')}</option>
              <option value="ink">{t('Ink', '墨色')}</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={fill}
              onChange={(event) => setFill(event.target.checked)}
            />{' '}
            {t('Fill', '填充')}
          </label>
          <label>
            <input
              type="checkbox"
              checked={rough}
              onChange={(event) => setRough(event.target.checked)}
            />{' '}
            {t('Rough stroke', '手绘描边')}
          </label>
        </fieldset>
        <div
          className="excalidraw-ip-flow"
          data-ink={ink}
          data-fill={fill}
          data-rough={rough}
          style={{ zoom: zoom / 100 }}
        >
          {nodes.map((node, index) => (
            <Fragment key={index}>
              {index > 0 && (
                <svg aria-hidden="true" viewBox="0 0 26 20">
                  <path d="M2 11Q14 8 24 11m-7-6 7 6-7 5M3 12Q13 10 21 11" />
                </svg>
              )}
              {current === index && editing ? (
                <input
                  ref={edit}
                  value={node.text}
                  maxLength={30}
                  aria-label={t('Node label', '节点标签')}
                  onBlur={finishLabel}
                  onChange={(event) =>
                    setNodes(
                      nodes.map((n, i) => (i === index ? { ...n, text: event.target.value } : n)),
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    finishLabel();
                    requestAnimationFrame(() => focus.current.get(index)?.focus());
                  }}
                />
              ) : (
                <button
                  ref={(element) => {
                    if (element) focus.current.set(index, element);
                    else focus.current.delete(index);
                  }}
                  type="button"
                  aria-pressed={current === index}
                  data-shape={shapes[node.shape]}
                  onClick={() => {
                    if (current === index) {
                      originalLabel.current = node.text;
                      setPast((stack) => [...stack.slice(-19), nodes]);
                      setFuture([]);
                      setEditing(true);
                    } else setCurrent(index);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Tab' && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      bump();
                    }
                  }}
                >
                  {node.text || t('Untitled', '无标题')}
                </button>
              )}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="excalidraw-ip-actions">
        <button
          type="button"
          aria-label={t('Zoom out', '缩小')}
          disabled={zoom <= 75}
          onClick={() => setZoom(zoom - 25)}
        >
          −
        </button>
        <output aria-live="polite">{zoom}%</output>
        <button
          type="button"
          aria-label={t('Zoom in', '放大')}
          disabled={zoom >= 150}
          onClick={() => setZoom(zoom + 25)}
        >
          +
        </button>
        <button type="button" disabled={past.length === 0} onClick={() => restore()}>
          {t('Undo', '撤销')}
        </button>
        <button type="button" disabled={future.length === 0} onClick={() => restore(true)}>
          {t('Redo', '重做')}
        </button>
        <button type="button" onClick={add} disabled={nodes.length >= ideas.length}>
          {t('Add connected node', '添加相连节点')}
        </button>
        <button type="button" onClick={bump}>
          {t('Change shape', '更改形状')}
        </button>
      </div>
    </div>
  );
}
