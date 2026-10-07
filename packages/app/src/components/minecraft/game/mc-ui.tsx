'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { ICON, ICON_COLUMNS, ICON_ROWS, type IconName } from './mc-atlas';
import { xpForLevel, type Game, type SlotRef } from './mc-game';
import { ITEMS, itemName, type Stack } from './mc-items';

export const GAME_ASSETS = '/decorative/minecraft/game/';
type Locale = 'en' | 'zh';

const tr = (locale: Locale, en: string, zh: string) => (locale === 'zh' ? zh : en);

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
export function iconStyle(icon: IconName | undefined, size: number): CSSProperties {
  const index = icon === undefined ? 0 : (ICON[icon] ?? 0);
  const col = index % ICON_COLUMNS;
  const row = Math.floor(index / ICON_COLUMNS);
  return {
    width: size,
    height: size,
    backgroundImage: `url(${GAME_ASSETS}icons.png)`,
    backgroundSize: `${ICON_COLUMNS * size}px ${ICON_ROWS * size}px`,
    backgroundPosition: `${-col * size}px ${-row * size}px`,
  };
}

export function ItemStack({ stack, scale }: { stack: Stack; scale: number }) {
  const def = ITEMS[stack.id];
  const size = 16 * scale;
  const durability = def?.tool?.durability;
  const wear = stack.wear ?? 0;
  const fraction = durability ? Math.max(0, 1 - wear / durability) : 1;
  return (
    <span className="mc-item" style={{ width: size, height: size }}>
      <span className="mc-item-icon" style={iconStyle(def?.icon, size)} />
      {durability && wear > 0 ? (
        <span
          className="mc-durability"
          style={{ left: 2 * scale, bottom: Number(scale), width: 13 * scale, height: 2 * scale }}
        >
          <span
            style={{
              width: `${Math.round(fraction * 13) * scale}px`,
              height: scale,
              background: `hsl(${Math.round(fraction * 120)} 100% 50%)`,
            }}
          />
        </span>
      ) : null}
      {stack.count > 1 ? (
        <span
          className="mc-count"
          style={{
            fontSize: 8 * scale,
            right: -1 * scale,
            bottom: -1.5 * scale,
            textShadow: `${scale}px ${scale}px 0 #3f3f3f`,
          }}
        >
          {stack.count}
        </span>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
export interface ChatLine {
  id: number;
  text: string;
  time: number;
}

export function Hud({
  game,
  scale,
  locale,
  chat,
  chatOpen,
  heldName,
  debug,
  fps,
  extraDebug,
}: {
  game: Game;
  scale: number;
  locale: Locale;
  chat: ChatLine[];
  chatOpen: boolean;
  heldName: { text: string; time: number } | null;
  debug: boolean;
  fps: number;
  extraDebug: string[];
}) {
  const p = game.player;
  const survival = game.mode === 'survival';
  const s = scale;
  const now = performance.now();
  const hearts = [];
  const lowHealth = p.health <= 4;
  for (let i = 0; i < 10; i++) {
    const shake = lowHealth ? Math.round(Math.sin(now / 40 + i * 7) * s) : 0;
    const full = p.health >= i * 2 + 2;
    const half = !full && p.health >= i * 2 + 1;
    hearts.push(
      <span
        key={i}
        className="mc-hud-icon"
        style={{ left: i * 8 * s, top: shake, width: 9 * s, height: 9 * s }}
      >
        <img src={`${GAME_ASSETS}heart-container.png`} alt="" />
        {full || half ? (
          <img src={`${GAME_ASSETS}heart-${full ? 'full' : 'half'}.png`} alt="" />
        ) : null}
      </span>,
    );
  }
  const food = [];
  for (let i = 0; i < 10; i++) {
    const full = p.food >= i * 2 + 2;
    const half = !full && p.food >= i * 2 + 1;
    const shake =
      p.saturation <= 0 && game.ticks % (p.food * 3 + 1) === 0
        ? Math.round((Math.random() - 0.5) * 2 * s)
        : 0;
    food.push(
      <span
        key={i}
        className="mc-hud-icon"
        style={{ right: i * 8 * s, top: shake, width: 9 * s, height: 9 * s }}
      >
        <img src={`${GAME_ASSETS}food-empty.png`} alt="" />
        {full || half ? (
          <img src={`${GAME_ASSETS}food-${full ? 'full' : 'half'}.png`} alt="" />
        ) : null}
      </span>,
    );
  }
  const bubbles = [];
  if (p.eyesInWater || p.air < 300) {
    const count = Math.ceil(((p.air - 2) * 10) / 300);
    const pop = Math.ceil((p.air * 10) / 300) - count;
    for (let i = 0; i < count + pop; i++)
      bubbles.push(
        <img
          key={i}
          className="mc-hud-icon"
          src={`${GAME_ASSETS}air.png`}
          alt=""
          style={{ right: i * 8 * s, width: 9 * s, height: 9 * s, opacity: i >= count ? 0.5 : 1 }}
        />,
      );
  }
  const xpNeed = xpForLevel(p.level);
  const xpFraction = Math.min(1, p.xp / xpNeed);
  const hotbarBottom = 0;
  const visibleChat = chatOpen
    ? chat.slice(-20)
    : chat.filter((c) => now - c.time < 10_000).slice(-10);
  return (
    <div className="mc-hud" data-mc-silent>
      <img
        className="mc-crosshair"
        src={`${GAME_ASSETS}crosshair.png`}
        alt=""
        style={{ width: 15 * s, height: 15 * s }}
      />
      <div
        className="mc-hotbar-wrap"
        style={{ width: 182 * s, height: 22 * s, bottom: hotbarBottom }}
      >
        <img
          src={`${GAME_ASSETS}hotbar.png`}
          alt=""
          className="mc-pixel"
          style={{ width: 182 * s, height: 22 * s }}
        />
        <img
          src={`${GAME_ASSETS}hotbar-selection.png`}
          alt=""
          className="mc-pixel mc-hotbar-selection"
          style={{
            width: 24 * s,
            height: 23 * s,
            left: (-1 + game.selected * 20) * s,
            top: -1 * s,
          }}
        />
        {game.inventory.slice(0, 9).map((stack, i) =>
          stack ? (
            <span key={i} className="mc-hotbar-item" style={{ left: (3 + i * 20) * s, top: 3 * s }}>
              <ItemStack stack={stack} scale={s} />
            </span>
          ) : null,
        )}
        {survival ? (
          <>
            <div className="mc-xp" style={{ width: 182 * s, height: 5 * s, top: -7 * s }}>
              <img src={`${GAME_ASSETS}xp-bg.png`} alt="" className="mc-pixel" />
              <span style={{ width: Math.round(xpFraction * 182) * s }}>
                <img
                  src={`${GAME_ASSETS}xp-fill.png`}
                  alt=""
                  className="mc-pixel"
                  style={{ width: 182 * s, height: 5 * s }}
                />
              </span>
            </div>
            {p.level > 0 ? (
              <span className="mc-xp-level" style={{ fontSize: 8 * s, top: -15 * s }}>
                {p.level}
              </span>
            ) : null}
            <div
              className="mc-hud-row"
              style={{ left: 0, top: -17 * s, width: 81 * s, height: 9 * s }}
            >
              {hearts}
            </div>
            <div
              className="mc-hud-row"
              style={{ right: 0, top: -17 * s, width: 81 * s, height: 9 * s }}
            >
              {food}
            </div>
            <div
              className="mc-hud-row"
              style={{ right: 0, top: -27 * s, width: 81 * s, height: 9 * s }}
            >
              {bubbles}
            </div>
          </>
        ) : null}
        {heldName && now - heldName.time < 2000 ? (
          <span
            className="mc-held-name"
            style={{
              fontSize: 8 * s,
              top: (survival ? -37 : -23) * s,
              opacity: Math.min(1, (2000 - (now - heldName.time)) / 400),
              textShadow: `${s}px ${s}px 0 #3f3f3f`,
            }}
          >
            {heldName.text}
          </span>
        ) : null}
      </div>
      <div
        className="mc-chat"
        style={{ bottom: (chatOpen ? 14 : 40) * s, fontSize: 8 * s, width: 320 * s }}
      >
        {visibleChat.map((c) => (
          <div
            key={c.id}
            style={{
              opacity: chatOpen ? 1 : Math.min(1, (10_000 - (now - c.time)) / 1000),
              padding: `0 ${2 * s}px`,
              textShadow: `${s}px ${s}px 0 #3f3f3f`,
            }}
          >
            {c.text}
          </div>
        ))}
      </div>
      {debug ? (
        <DebugOverlay game={game} fps={fps} extra={extraDebug} scale={s} locale={locale} />
      ) : null}
    </div>
  );
}

const FACING = [
  ['north', '北', 'Towards negative Z', '朝向 Z 轴负方向'],
  ['west', '西', 'Towards negative X', '朝向 X 轴负方向'],
  ['south', '南', 'Towards positive Z', '朝向 Z 轴正方向'],
  ['east', '东', 'Towards positive X', '朝向 X 轴正方向'],
];

function DebugOverlay({
  game,
  fps,
  extra,
  scale,
  locale,
}: {
  game: Game;
  fps: number;
  extra: string[];
  scale: number;
  locale: Locale;
}) {
  const p = game.player;
  const bx = Math.floor(p.x);
  const by = Math.floor(p.y);
  const bz = Math.floor(p.z);
  const yawDeg = (((((-p.yaw * 180) / Math.PI) % 360) + 540) % 360) - 180;
  const facing = FACING[((Math.round(-p.yaw / (Math.PI / 2)) % 4) + 4) % 4];
  const col = game.world.terrain.column(bx, bz);
  const light = game.world.getLight(bx, by, bz);
  const day = Math.floor(game.time / 24000);
  const left = [
    'Minecraft (InferenceX edition)',
    `${fps} fps`,
    `XYZ: ${p.x.toFixed(3)} / ${p.y.toFixed(5)} / ${p.z.toFixed(3)}`,
    `Block: ${bx} ${by} ${bz}`,
    `Chunk: ${bx & 15} ${by} ${bz & 15} in ${bx >> 4} ${bz >> 4}`,
    `Facing: ${tr(locale, facing[0], facing[1])} (${tr(locale, facing[2], facing[3])}) (${yawDeg.toFixed(1)} / ${((-p.pitch * 180) / Math.PI).toFixed(1)})`,
    `Light: ${Math.max(light >> 4, light & 15)} (${light >> 4} sky, ${light & 15} block)`,
    `Biome: minecraft:${col.biome}`,
    `Day ${day}, time ${game.dayTime}`,
    `Mode: ${game.mode}, difficulty: ${game.difficulty}`,
    `Seed: ${game.options.seed}`,
    ...extra,
  ];
  const target = game.target;
  const right = target
    ? [
        `Targeted Block: ${target.x}, ${target.y}, ${target.z}`,
        `minecraft:${blockKey(target.id)}`,
        `meta ${game.world.getMeta(target.x, target.y, target.z)}`,
      ]
    : [];
  const style = { fontSize: 8 * scale, lineHeight: `${9 * scale}px` };
  return (
    <>
      <div className="mc-debug mc-debug-left" style={style}>
        {left.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
      <div className="mc-debug mc-debug-right" style={style}>
        {right.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </>
  );
}

function blockKey(id: number) {
  for (const def of Object.values(ITEMS)) if (def.block === id) return def.key;
  return String(id);
}

// ---------------------------------------------------------------------------
// Container screens
// ---------------------------------------------------------------------------
interface SlotPos {
  ref: SlotRef;
  x: number;
  y: number;
}

function grid(
  kind: 'inv' | 'chest',
  start: number,
  cols: number,
  rows: number,
  x: number,
  y: number,
): SlotPos[] {
  const out: SlotPos[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push({ ref: { kind, index: start + r * cols + c }, x: x + c * 18, y: y + r * 18 });
  return out;
}

function playerSlots(y: number): SlotPos[] {
  return [...grid('inv', 9, 9, 3, 8, y), ...grid('inv', 0, 9, 1, 8, y + 58)];
}

function craftSlots(size: 2 | 3, x: number, y: number): SlotPos[] {
  const out: SlotPos[] = [];
  const map = size === 3 ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [0, 1, 3, 4];
  for (let i = 0; i < size * size; i++)
    out.push({
      ref: { kind: 'craft', index: map[i] },
      x: x + (i % size) * 18,
      y: y + Math.floor(i / size) * 18,
    });
  return out;
}

const sameRef = (a: SlotRef, b: SlotRef) => JSON.stringify(a) === JSON.stringify(b);

export function ContainerScreen({
  game,
  scale,
  locale,
  onChange,
  onHover,
}: {
  game: Game;
  scale: number;
  locale: Locale;
  onChange: () => void;
  onHover: (ref: SlotRef | null) => void;
}) {
  const screen = game.screen!;
  const s = scale;
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<SlotRef | null>(null);
  const drag = useRef<{ button: 'left' | 'right'; refs: SlotRef[] } | null>(null);
  const lastClick = useRef<{ ref: SlotRef; time: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => {
    switch (screen.kind) {
      case 'inventory': {
        return {
          bg: 'gui-inventory.png',
          w: 176,
          h: 166,
          slots: [
            ...craftSlots(2, 98, 18),
            { ref: { kind: 'result' } as SlotRef, x: 154, y: 28 },
            ...playerSlots(84),
          ],
          labels: [{ text: tr(locale, 'Crafting', '合成'), x: 97, y: 8 }],
        };
      }
      case 'crafting': {
        return {
          bg: 'gui-crafting.png',
          w: 176,
          h: 166,
          slots: [
            ...craftSlots(3, 30, 17),
            { ref: { kind: 'result' } as SlotRef, x: 124, y: 35 },
            ...playerSlots(84),
          ],
          labels: [
            { text: tr(locale, 'Crafting', '合成'), x: 28, y: 6 },
            { text: tr(locale, 'Inventory', '物品栏'), x: 8, y: 72 },
          ],
        };
      }
      case 'furnace': {
        return {
          bg: 'gui-furnace.png',
          w: 176,
          h: 166,
          slots: [
            { ref: { kind: 'furnace', slot: 'input' } as SlotRef, x: 56, y: 17 },
            { ref: { kind: 'furnace', slot: 'fuel' } as SlotRef, x: 56, y: 53 },
            { ref: { kind: 'furnace', slot: 'output' } as SlotRef, x: 116, y: 35 },
            ...playerSlots(84),
          ],
          labels: [
            { text: tr(locale, 'Furnace', '熔炉'), x: 88, y: 6, center: true },
            { text: tr(locale, 'Inventory', '物品栏'), x: 8, y: 72 },
          ],
        };
      }
      case 'chest': {
        return {
          bg: 'gui-chest.png',
          w: 176,
          h: 167,
          slots: [...grid('chest', 0, 9, 3, 8, 18), ...playerSlots(85)],
          labels: [
            { text: tr(locale, 'Chest', '箱子'), x: 8, y: 6 },
            { text: tr(locale, 'Inventory', '物品栏'), x: 8, y: 73 },
          ],
        };
      }
      default: {
        return { bg: '', w: 0, h: 0, slots: [], labels: [] };
      }
    }
  }, [screen.kind, locale]);

  useEffect(() => {
    const move = (e: PointerEvent) => setMouse({ x: e.clientX, y: e.clientY });
    const up = () => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (d.refs.length > 1) game.distribute(d.refs, d.button);
      else if (d.refs.length === 1) game.clickSlot(d.refs[0], d.button, false);
      onChange();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [game, onChange]);

  if (screen.kind === 'creative')
    return (
      <CreativeScreen game={game} scale={s} locale={locale} onChange={onChange} onHover={onHover} />
    );

  const down = (ref: SlotRef, e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const button = e.button === 2 ? 'right' : 'left';
    if (e.button === 1) {
      // Middle click in creative clones a full stack.
      const st = game.slot(ref);
      if (game.mode === 'creative' && st && !game.cursor)
        game.cursor = { ...st, count: ITEMS[st.id]?.stack ?? 64 };
      onChange();
      return;
    }
    if (e.shiftKey) {
      game.clickSlot(ref, button, true);
      onChange();
      return;
    }
    const now = performance.now();
    const last = lastClick.current;
    if (
      button === 'left' &&
      last &&
      sameRef(last.ref, ref) &&
      now - last.time < 250 &&
      game.cursor
    ) {
      game.collectToCursor();
      lastClick.current = null;
      onChange();
      return;
    }
    lastClick.current = { ref, time: now };
    if (game.cursor && game.accepts(ref)) {
      drag.current = { button, refs: [ref] };
      return;
    }
    game.clickSlot(ref, button, false);
    onChange();
  };

  const enter = (ref: SlotRef) => {
    setHover(ref);
    onHover(ref);
    const d = drag.current;
    if (d && game.cursor && !d.refs.some((r) => sameRef(r, ref)) && game.accepts(ref))
      d.refs.push(ref);
  };

  const furnace = game.furnaceAt();
  const hoverStack = hover ? game.slot(hover) : null;
  return (
    <div
      className="mc-screen-backdrop"
      data-mc-silent
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (game.cursor) {
          if (e.button === 2) {
            const one = { ...game.cursor, count: 1 };
            game.cursor.count--;
            const rest = game.cursor.count > 0 ? game.cursor : null;
            game.cursor = one;
            game.dropCursor();
            game.cursor = rest;
          } else game.dropCursor();
          onChange();
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={panel}
        className="mc-panel mc-pixel"
        data-testid="minecraft-container"
        data-screen={screen.kind}
        style={{
          width: layout.w * s,
          height: layout.h * s,
          backgroundImage: `url(${GAME_ASSETS}${layout.bg})`,
          backgroundSize:
            layout.bg === 'gui-chest.png'
              ? `${176 * s}px ${167 * s}px`
              : `${256 * s}px ${256 * s}px`,
        }}
      >
        {layout.labels.map((l) => (
          <span
            key={l.text}
            className="mc-label"
            style={{
              left: ('center' in l && l.center ? l.x - 40 : l.x) * s,
              width: 'center' in l && l.center ? 80 * s : undefined,
              textAlign: 'center' in l && l.center ? 'center' : undefined,
              top: (l.y - 1) * s,
              fontSize: 8 * s,
            }}
          >
            {l.text}
          </span>
        ))}
        {screen.kind === 'inventory' ? <PlayerPreview scale={s} /> : null}
        {furnace ? (
          <>
            {furnace.burn > 0 ? (
              <span
                className="mc-furnace-flame"
                style={{
                  left: 57 * s,
                  top: 37 * s,
                  width: 14 * s,
                  height: 14 * s,
                  backgroundImage: `url(${GAME_ASSETS}furnace-lit.png)`,
                  backgroundSize: `${14 * s}px ${14 * s}px`,
                  clipPath: `inset(${(1 - furnace.burn / Math.max(1, furnace.burnMax)) * 100}% 0 0 0)`,
                }}
              />
            ) : null}
            <span
              className="mc-furnace-arrow"
              style={{
                left: 79 * s,
                top: 34 * s,
                width: Math.round((furnace.cook / 200) * 24) * s,
                height: 16 * s,
                backgroundImage: `url(${GAME_ASSETS}furnace-burn.png)`,
                backgroundSize: `${24 * s}px ${16 * s}px`,
              }}
            />
          </>
        ) : null}
        {layout.slots.map((slot) => {
          const stack = game.slot(slot.ref);
          const isHover = hover && sameRef(hover, slot.ref);
          const big =
            slot.ref.kind === 'result' ||
            (slot.ref.kind === 'furnace' && slot.ref.slot === 'output');
          return (
            <button
              key={JSON.stringify(slot.ref)}
              type="button"
              className={`mc-slot${isHover ? ' mc-slot-hover' : ''}`}
              aria-label={
                stack
                  ? `${itemName(stack.id, locale)} ×${stack.count}`
                  : tr(locale, 'Empty slot', '空槽位')
              }
              data-slot={JSON.stringify(slot.ref)}
              style={{
                left: (slot.x - (big ? 4 : 0)) * s,
                top: (slot.y - (big ? 4 : 0)) * s,
                width: (big ? 24 : 16) * s,
                height: (big ? 24 : 16) * s,
                padding: big ? 4 * s : 0,
              }}
              onPointerDown={(e) => down(slot.ref, e)}
              onPointerEnter={() => enter(slot.ref)}
              onPointerLeave={() => {
                setHover(null);
                onHover(null);
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {stack ? <ItemStack stack={stack} scale={s} /> : null}
            </button>
          );
        })}
      </div>
      {hoverStack && !game.cursor ? (
        <Tooltip stack={hoverStack} mouse={mouse} scale={s} locale={locale} />
      ) : null}
      {game.cursor && mouse ? (
        <span className="mc-cursor-stack" style={{ left: mouse.x - 8 * s, top: mouse.y - 8 * s }}>
          <ItemStack stack={game.cursor} scale={s} />
        </span>
      ) : null}
    </div>
  );
}

function Tooltip({
  stack,
  mouse,
  scale,
  locale,
}: {
  stack: Stack;
  mouse: { x: number; y: number } | null;
  scale: number;
  locale: Locale;
}) {
  if (!mouse) return null;
  const def = ITEMS[stack.id];
  const lines = [itemName(stack.id, locale)];
  if (def?.tool?.durability && stack.wear)
    lines.push(
      `${tr(locale, 'Durability', '耐久度')}: ${def.tool.durability - stack.wear} / ${def.tool.durability}`,
    );
  if (def?.damage && def.tool)
    lines.push(tr(locale, `${def.damage} Attack Damage`, `${def.damage} 攻击伤害`));
  return (
    <div
      className="mc-tooltip"
      style={{
        left: mouse.x + 12 * scale,
        top: mouse.y - 12 * scale,
        fontSize: 8 * scale,
        padding: `${3 * scale}px ${4 * scale}px`,
        borderWidth: scale,
      }}
    >
      {lines.map((l, i) => (
        <div
          key={i}
          style={{ color: i ? '#a8a8a8' : '#fff', textShadow: `${scale}px ${scale}px 0 #3f3f3f` }}
        >
          {l}
        </div>
      ))}
    </div>
  );
}

/** Steve's front faces cut from the skin, standing in the inventory preview box. */
function PlayerPreview({ scale }: { scale: number }) {
  const s = scale * 2.2;
  const part = (u: number, v: number, w: number, h: number, x: number, y: number) => (
    <span
      className="mc-preview-part"
      style={{
        left: x * s,
        top: y * s,
        width: w * s,
        height: h * s,
        backgroundImage: `url(${GAME_ASSETS}steve.png)`,
        backgroundSize: `${64 * s}px ${64 * s}px`,
        backgroundPosition: `${-u * s}px ${-v * s}px`,
      }}
    />
  );
  return (
    <span
      className="mc-preview"
      style={{ left: 26 * scale, top: 8 * scale, width: 49 * scale, height: 70 * scale }}
    >
      <span
        style={{
          position: 'absolute',
          left: (49 * scale - 16 * s) / 2,
          top: 2 * scale,
          width: 16 * s,
          height: 32 * s,
        }}
      >
        {part(8, 8, 8, 8, 4, 0)}
        {part(40, 8, 8, 8, 4, 0)}
        {part(20, 20, 8, 12, 4, 8)}
        {part(44, 20, 4, 12, 0, 8)}
        {part(36, 52, 4, 12, 12, 8)}
        {part(4, 20, 4, 12, 4, 20)}
        {part(20, 52, 4, 12, 8, 20)}
      </span>
    </span>
  );
}

const CREATIVE_ITEMS = Object.keys(ITEMS);

function CreativeScreen({
  game,
  scale,
  locale,
  onChange,
  onHover,
}: {
  game: Game;
  scale: number;
  locale: Locale;
  onChange: () => void;
  onHover: (ref: SlotRef | null) => void;
}) {
  const s = scale;
  const [query, setQuery] = useState('');
  const [row, setRow] = useState(0);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<Stack | null>(null);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? CREATIVE_ITEMS.filter(
          (id) =>
            id.includes(q.replaceAll(' ', '_')) || itemName(id, locale).toLowerCase().includes(q),
        )
      : CREATIVE_ITEMS;
  }, [query, locale]);
  const rows = Math.ceil(list.length / 9);
  const maxRow = Math.max(0, rows - 5);
  const start = Math.min(row, maxRow);
  useEffect(() => {
    const move = (e: PointerEvent) => setMouse({ x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);
  const hotbar = grid('inv', 0, 9, 1, 9, 112);
  return (
    <div
      className="mc-screen-backdrop"
      data-mc-silent
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget) return;
        game.cursor = null;
        onChange();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="mc-panel mc-pixel"
        data-testid="minecraft-container"
        data-screen="creative"
        style={{
          width: 195 * s,
          height: 136 * s,
          backgroundImage: `url(${GAME_ASSETS}gui-creative.png)`,
          backgroundSize: `${195 * s}px ${136 * s}px`,
        }}
        onWheel={(e) => setRow((r) => Math.max(0, Math.min(maxRow, r + Math.sign(e.deltaY))))}
      >
        <span className="mc-label" style={{ left: 8 * s, top: 5 * s, fontSize: 8 * s }}>
          {tr(locale, 'Search Items', '搜索物品')}
        </span>
        <input
          className="mc-creative-search"
          aria-label={tr(locale, 'Search items', '搜索物品')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setRow(0);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
          }}
          style={{ left: 82 * s, top: 6 * s, width: 89 * s, height: 10 * s, fontSize: 8 * s }}
        />
        {Array.from({ length: 45 }, (_, i) => {
          const id = list[start * 9 + i];
          if (!id) return null;
          const stack = { id, count: 1 };
          return (
            <button
              key={id}
              type="button"
              className="mc-slot"
              aria-label={itemName(id, locale)}
              style={{
                left: (9 + (i % 9) * 18) * s,
                top: (18 + Math.floor(i / 9) * 18) * s,
                width: 16 * s,
                height: 16 * s,
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                if (game.cursor && game.cursor.id !== id) game.cursor = null;
                else game.creativePick(id, e.shiftKey || e.button === 1);
                onChange();
              }}
              onPointerEnter={() => setHover(stack)}
              onPointerLeave={() => setHover(null)}
              onContextMenu={(e) => e.preventDefault()}
            >
              <ItemStack stack={stack} scale={s} />
            </button>
          );
        })}
        <span
          className="mc-scroller mc-pixel"
          style={{
            left: 175 * s,
            top: (18 + (maxRow ? (start / maxRow) * (112 - 15) : 0)) * s,
            width: 12 * s,
            height: 15 * s,
            backgroundImage: `url(${GAME_ASSETS}${maxRow ? 'scroller' : 'scroller-disabled'}.png)`,
            backgroundSize: `${12 * s}px ${15 * s}px`,
          }}
        />
        {hotbar.map((slot) => {
          const stack = game.slot(slot.ref);
          return (
            <button
              key={JSON.stringify(slot.ref)}
              type="button"
              className="mc-slot"
              aria-label={stack ? itemName(stack.id, locale) : tr(locale, 'Empty slot', '空槽位')}
              style={{ left: slot.x * s, top: slot.y * s, width: 16 * s, height: 16 * s }}
              onPointerDown={(e) => {
                e.preventDefault();
                game.clickSlot(slot.ref, e.button === 2 ? 'right' : 'left', false);
                if (e.shiftKey) game.inventory[(slot.ref as { index: number }).index] = null;
                onChange();
              }}
              onPointerEnter={() => {
                onHover(slot.ref);
                setHover(stack);
              }}
              onPointerLeave={() => {
                onHover(null);
                setHover(null);
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {stack ? <ItemStack stack={stack} scale={s} /> : null}
            </button>
          );
        })}
      </div>
      {hover && !game.cursor ? (
        <Tooltip stack={hover} mouse={mouse} scale={s} locale={locale} />
      ) : null}
      {game.cursor && mouse ? (
        <span className="mc-cursor-stack" style={{ left: mouse.x - 8 * s, top: mouse.y - 8 * s }}>
          <ItemStack stack={game.cursor} scale={s} />
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Menu widgets
// ---------------------------------------------------------------------------
export function McButton({
  children,
  onClick,
  width = 200,
  scale,
  disabled,
  testId,
}: {
  children: React.ReactNode;
  onClick: () => void;
  width?: number;
  scale: number;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className="mc-button"
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
      style={{
        width: width * scale,
        height: 20 * scale,
        fontSize: 8 * scale,
        ['--mc-bw' as string]: `${3 * scale}px`,
        textShadow: `${scale}px ${scale}px 0 #3f3f3f`,
      }}
    >
      {children}
    </button>
  );
}

export function McSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  scale,
  width = 150,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  scale: number;
  width?: number;
}) {
  const fraction = (value - min) / (max - min);
  return (
    <label
      className="mc-slider"
      style={{
        width: width * scale,
        height: 20 * scale,
        fontSize: 8 * scale,
        borderWidth: 3 * scale,
      }}
    >
      <span
        className="mc-slider-handle"
        style={{
          left: `calc(${fraction * 100}% - ${fraction * 8 * scale}px)`,
          width: 8 * scale,
          height: 20 * scale,
          top: -3 * scale,
          marginLeft: -3 * scale,
        }}
      />
      <span className="mc-slider-label" style={{ textShadow: `${scale}px ${scale}px 0 #3f3f3f` }}>
        {label}: {format(value)}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function McTextField({
  value,
  onChange,
  scale,
  width = 200,
  label,
  testId,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  scale: number;
  width?: number;
  label: string;
  testId?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      className="mc-text-field"
      value={value}
      aria-label={label}
      data-testid={testId}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.stopPropagation()}
      style={{
        width: width * scale,
        height: 20 * scale,
        fontSize: 8 * scale,
        padding: `0 ${4 * scale}px`,
      }}
    />
  );
}

export { tr };

const PANORAMA_FACES = [
  // Vanilla order: 0 front, 1 right, 2 back, 3 left, 4 up, 5 down.
  'rotateY(0deg)',
  'rotateY(-90deg)',
  'rotateY(180deg)',
  'rotateY(90deg)',
  'rotateX(-90deg)',
  'rotateX(90deg)',
];

/** Slowly rotating title-screen panorama cube, as in the vanilla client. */
export function Panorama() {
  return (
    <div className="mc-panorama" aria-hidden="true">
      <div className="mc-panorama-view">
        <div className="mc-panorama-cube">
          {PANORAMA_FACES.map((rotation, i) => (
            <img
              key={rotation}
              src={`${GAME_ASSETS}panorama-${i}.jpg`}
              alt=""
              draggable={false}
              style={{ transform: `${rotation} translateZ(calc(var(--mc-pano) * -1))` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
