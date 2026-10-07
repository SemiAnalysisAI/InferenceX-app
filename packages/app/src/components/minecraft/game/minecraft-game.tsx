'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import { SPLASHES } from '../minecraft-splash-text';
import { Audio } from './mc-audio';
import { BLOCKS } from './mc-blocks';
import {
  Game,
  NO_INPUT,
  type Difficulty,
  type GameMode,
  type Input,
  type SlotRef,
} from './mc-game';
import { ITEMS, itemName } from './mc-items';
import { loadAssets, Renderer, type RenderOptions } from './mc-renderer';
import {
  deleteWorld,
  listWorlds,
  loadWorld,
  newWorldMeta,
  restore,
  saveWorld,
  serialize,
  type WorldMeta,
} from './mc-save';
import {
  ContainerScreen,
  GAME_ASSETS,
  Hud,
  McButton,
  McSlider,
  McTextField,
  Panorama,
  tr,
  type ChatLine,
} from './mc-ui';
import './minecraft-game.css';

type Locale = 'en' | 'zh';
type Phase = 'title' | 'worlds' | 'create' | 'options' | 'loading' | 'playing' | 'error';
type Overlay = null | 'pause' | 'options' | 'chat' | 'death';

interface Settings {
  fov: number;
  sensitivity: number;
  renderDistance: number;
  viewBobbing: boolean;
  gamma: number;
  clouds: boolean;
  volume: number;
}
const DEFAULT_SETTINGS: Settings = {
  fov: 70,
  sensitivity: 0.5,
  renderDistance: 6,
  viewBobbing: true,
  gamma: 0.5,
  clouds: true,
  volume: 0.8,
};
const SETTINGS_KEY = 'inferencex-minecraft-options';

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
      : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const AUTOSAVE_MS = 30_000;
const TOUCH_QUERY = '(pointer: coarse)';

interface Session {
  game: Game;
  renderer: Renderer;
  meta: WorldMeta;
  stop: () => void;
}

/** Key codes the game handles itself; their browser defaults are suppressed while playing. */
const GAME_KEYS = new Set([
  'Space',
  'F1',
  'F3',
  'F5',
  'Tab',
  'Slash',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyQ',
]);

export function MinecraftGame({ locale, onExit }: { locale: Locale; onExit: () => void }) {
  const t = useCallback((en: string, zh: string) => tr(locale, en, zh), [locale]);
  const [phase, setPhase] = useState<Phase>('title');
  const [overlay, setOverlayState] = useState<Overlay>(null);
  const overlayRef = useRef<Overlay>(null);
  const setOverlay = useCallback((o: Overlay) => {
    overlayRef.current = o;
    setOverlayState(o);
  }, []);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const settingsRef = useRef(settings);
  const [worlds, setWorlds] = useState<WorldMeta[]>([]);
  const [selectedWorld, setSelectedWorld] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    seed: '',
    mode: 'survival' as GameMode,
    difficulty: 'normal' as Difficulty,
  });
  const [progress, setProgress] = useState(0);
  const [errorText, setErrorText] = useState('');
  const [, refresh] = useReducer((x: number) => x + 1, 0);
  const [size, setSize] = useState({ w: 1280, h: 800 });
  const [touch, setTouch] = useState(false);
  const [hideHud, setHideHud] = useState(false);
  const [debug, setDebug] = useState(false);
  const [perspective, setPerspective] = useState<0 | 1 | 2>(0);
  const perspectiveRef = useRef<0 | 1 | 2>(0);
  const hideHudRef = useRef(false);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [chatText, setChatText] = useState('');
  const chatHistory = useRef<string[]>([]);
  const chatHistoryIndex = useRef(-1);
  const [heldName, setHeldName] = useState<{ text: string; time: number } | null>(null);
  const [fps, setFps] = useState(0);
  const [splash] = useState(() => SPLASHES[Math.floor(Math.random() * SPLASHES.length)]);
  const [locked, setLocked] = useState(false);
  const [saveNote, setSaveNote] = useState('');

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const audioRef = useRef<Audio | null>(null);
  const pendingRef = useRef<{ meta: WorldMeta; data: ReturnType<typeof loadWorld> } | null>(null);
  const keys = useRef(new Set<string>());
  const mouse = useRef({ attack: false, use: false });
  const touchInput = useRef({
    moveX: 0,
    moveZ: 0,
    jump: false,
    sneak: false,
    attack: false,
    use: false,
    sprint: false,
  });
  const hoverSlot = useRef<SlotRef | null>(null);
  const chatId = useRef(0);
  const lastSelected = useRef(-1);
  const lastHeld = useRef('');

  useEffect(() => {
    const s = readSettings();
    setSettings(s);
    settingsRef.current = s;
    setWorlds(listWorlds());
    setTouch(window.matchMedia?.(TOUCH_QUERY).matches ?? false);
    audioRef.current = new Audio();
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      settingsRef.current = next;
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      const session = sessionRef.current;
      if (session) session.game.renderDistance = next.renderDistance;
      audioRef.current?.setVolume(next.volume);
      return next;
    });
  }, []);

  // Track the container size for GUI scaling and the renderer.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const guiScale = useMemo(() => {
    const auto = Math.max(1, Math.min(4, Math.floor(size.w / 320), Math.floor(size.h / 240)));
    return size.w < 640 ? Math.max(1, Math.min(2, Math.floor(size.w / 185))) : auto;
  }, [size]);
  const screenScale = useMemo(
    () => Math.max(1, Math.min(guiScale + 1, Math.floor(size.w / 200), Math.floor(size.h / 180))),
    [guiScale, size],
  );

  useEffect(() => {
    sessionRef.current?.renderer.setSize(size.w, size.h, window.devicePixelRatio || 1);
  }, [size]);

  const pushChat = useCallback((text: string) => {
    setChat((c) => [...c.slice(-99), { id: chatId.current++, text, time: performance.now() }]);
  }, []);

  // -------------------------------------------------------------------------
  // Saving
  // -------------------------------------------------------------------------
  const save = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return false;
    const data = serialize(s.game, s.meta);
    s.meta = data.meta;
    const ok = saveWorld(data);
    if (!ok)
      setSaveNote(
        t(
          'Could not save: browser storage is full or disabled.',
          '无法保存：浏览器存储已满或被禁用。',
        ),
      );
    return ok;
  }, [t]);

  const endSession = useCallback(
    (saveFirst: boolean) => {
      const s = sessionRef.current;
      if (!s) return;
      if (saveFirst) save();
      s.stop();
      s.renderer.dispose();
      sessionRef.current = null;
      if (document.pointerLockElement) document.exitPointerLock();
      keys.current.clear();
      setWorlds(listWorlds());
    },
    [save],
  );

  // Save on unmount (dialog closed).
  const endSessionRef = useRef(endSession);
  endSessionRef.current = endSession;
  useEffect(() => () => endSessionRef.current(true), []);

  // -------------------------------------------------------------------------
  // Pointer lock
  // -------------------------------------------------------------------------
  const lock = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || touch) return;
    audioRef.current?.resume();
    try {
      const r = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === 'function') r.catch(() => undefined);
    } catch {
      /* not supported */
    }
  }, [touch]);

  useEffect(() => {
    const onChange = () => {
      const isLocked =
        document.pointerLockElement === canvasRef.current && Boolean(canvasRef.current);
      setLocked(isLocked);
      const s = sessionRef.current;
      if (
        !isLocked &&
        s &&
        phase === 'playing' &&
        !s.game.screen &&
        overlayRef.current === null &&
        !s.game.player.dead
      ) {
        setOverlay('pause');
        mouse.current.attack = false;
        mouse.current.use = false;
      }
    };
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, [phase, setOverlay]);

  // -------------------------------------------------------------------------
  // Session lifecycle
  // -------------------------------------------------------------------------
  const startWorld = useCallback(
    (meta: WorldMeta, data: ReturnType<typeof loadWorld>) => {
      pendingRef.current = { meta, data };
      setProgress(0);
      setChat([]);
      setOverlay(null);
      setPhase('loading');
    },
    [setOverlay],
  );

  useEffect(() => {
    if (phase !== 'loading' || sessionRef.current || !pendingRef.current) return;
    const pending = pendingRef.current;
    pendingRef.current = null;
    let cancelled = false;
    let sessionStarted = false;
    let raf = 0;
    void (async () => {
      let assets;
      try {
        assets = await loadAssets();
      } catch (error) {
        if (!cancelled) {
          setErrorText(String(error));
          setPhase('error');
        }
        return;
      }
      if (cancelled || !canvasRef.current) return;
      const game = pending.data
        ? restore(pending.data)
        : new Game({
            seed: pending.meta.seed,
            name: pending.meta.name,
            mode: pending.meta.mode,
            difficulty: pending.meta.difficulty,
          });
      game.locale = locale;
      game.renderDistance = settingsRef.current.renderDistance;
      let renderer: Renderer;
      try {
        renderer = new Renderer(canvasRef.current, game, assets);
      } catch (error) {
        setErrorText(String(error));
        setPhase('error');
        return;
      }
      const rect = rootRef.current!.getBoundingClientRect();
      renderer.setSize(
        Math.max(1, rect.width),
        Math.max(1, rect.height),
        window.devicePixelRatio || 1,
      );
      const audio = audioRef.current;
      audio?.setVolume(settingsRef.current.volume);
      audio?.preload([
        'dig/grass',
        'dig/stone',
        'dig/wood',
        'step/grass',
        'step/stone',
        'random/pop',
        'damage/hit',
        'random/click',
      ]);
      let running = true;
      let last = performance.now();
      let lastSave = last;
      let lastHud = 0;
      let frames = 0;
      let fpsTime = last;
      let loadingDone = false;
      let hitParticle = 0;
      const session: Session = {
        game,
        renderer,
        meta: pending.meta,
        stop: () => {
          running = false;
          cancelAnimationFrame(raf);
        },
      };
      sessionRef.current = session;
      sessionStarted = true;
      if (!pending.data) save();

      const buildInput = (): Input => {
        const o = overlayRef.current;
        if (o !== null || game.screen) return NO_INPUT;
        const k = keys.current;
        const ti = touchInput.current;
        return {
          forward: k.has('KeyW') || k.has('ArrowUp'),
          back: k.has('KeyS') || k.has('ArrowDown'),
          left: k.has('KeyA') || k.has('ArrowLeft'),
          right: k.has('KeyD') || k.has('ArrowRight'),
          jump: k.has('Space') || ti.jump,
          sneak: k.has('ShiftLeft') || k.has('ShiftRight') || ti.sneak,
          sprint: k.has('KeyR') || k.has('ControlLeft') || k.has('ControlRight') || ti.sprint,
          attack: mouse.current.attack || ti.attack,
          use: mouse.current.use || ti.use,
          moveX: ti.moveX,
          moveZ: ti.moveZ,
        };
      };

      const frame = () => {
        if (!running) return;
        raf = requestAnimationFrame(frame);
        const now = performance.now();
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        frames++;
        if (now - fpsTime >= 1000) {
          setFps(Math.round((frames * 1000) / (now - fpsTime)));
          frames = 0;
          fpsTime = now;
        }
        if (!loadingDone) {
          game.streamChunks(14);
          renderer.updateChunks(14);
          const rd = game.renderDistance;
          const target = Math.min(9, (2 * rd + 1) ** 2);
          const pct = Math.min(1, renderer.meshedChunks / target);
          setProgress(pct);
          if (game.spawnReady() && renderer.meshedChunks >= target) {
            loadingDone = true;
            // Never start inside terrain.
            const p = game.player;
            for (let i = 0; i < 128; i++) {
              const bx = Math.floor(p.x);
              const bz = Math.floor(p.z);
              const by = Math.floor(p.y);
              if (!isSolidBlock(game, bx, by, bz) && !isSolidBlock(game, bx, by + 1, bz)) break;
              p.y += 1;
            }
            p.py = p.y;
            setPhase('playing');
            if (game.player.dead) setOverlay('death');
            pushChat(
              t(
                'Press E for inventory, T for chat, F3 for debug, F5 to change view.',
                '按 E 打开物品栏，T 打开聊天，F3 调试信息，F5 切换视角。',
              ),
            );
          }
          renderer.render(1, dt, renderOptions());
          return;
        }
        game.streamChunks(3);
        renderer.updateChunks(4);
        const paused = overlayRef.current === 'pause' || overlayRef.current === 'options';
        let alpha = 1;
        if (!paused) alpha = game.update(dt, buildInput());
        // Events.
        const p = game.player;
        for (const ev of game.events.splice(0)) {
          switch (ev.type) {
            case 'sound': {
              const d = Math.hypot(ev.x - p.x, ev.y - (p.y + 1.6), ev.z - p.z);
              audio?.play(ev.key, ev.volume, ev.pitch, d);
              break;
            }
            case 'break': {
              renderer.addBreakParticles(ev.x, ev.y, ev.z, ev.id);
              break;
            }
            case 'explode': {
              renderer.addExplosionParticles(ev.x, ev.y, ev.z, ev.power);
              break;
            }
            case 'message': {
              pushChat(ev.text);
              break;
            }
            case 'open': {
              if (document.pointerLockElement) document.exitPointerLock();
              mouse.current.attack = false;
              mouse.current.use = false;
              refresh();
              break;
            }
            case 'death': {
              if (document.pointerLockElement) document.exitPointerLock();
              setOverlay('death');
              break;
            }
            default: {
              break;
            }
          }
        }
        // Mining crumbs.
        if (game.breakProgress > 0 && game.target && ++hitParticle % 3 === 0) {
          const tg = game.target;
          renderer.addHitParticle(tg.x, tg.y, tg.z, tg.face, tg.id);
        }
        // Held item name pop-up.
        const held = game.held;
        const heldKey = held?.id ?? '';
        if (game.selected !== lastSelected.current || heldKey !== lastHeld.current) {
          if (lastSelected.current !== -1 && held)
            setHeldName({ text: itemName(held.id, locale), time: performance.now() });
          lastSelected.current = game.selected;
          lastHeld.current = heldKey;
        }
        renderer.render(alpha, dt, renderOptions());
        if (now - lastHud > 100) {
          lastHud = now;
          refresh();
        }
        if (now - lastSave > AUTOSAVE_MS) {
          lastSave = now;
          save();
        }
      };
      const renderOptions = (): RenderOptions => ({
        fov: settingsRef.current.fov,
        thirdPerson: perspectiveRef.current,
        viewBobbing: settingsRef.current.viewBobbing,
        gamma: settingsRef.current.gamma,
        hideHand: hideHudRef.current,
        clouds: settingsRef.current.clouds,
      });
      raf = requestAnimationFrame(frame);
    })();
    return () => {
      // Once the session exists its loop is owned by session.stop(), not this effect.
      cancelled = true;
      if (!sessionStarted) cancelAnimationFrame(raf);
    };
  }, [phase, locale, pushChat, save, setOverlay, t]);

  // -------------------------------------------------------------------------
  // Keyboard
  // -------------------------------------------------------------------------
  const closeScreen = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    s.game.closeScreen();
    hoverSlot.current = null;
    refresh();
    lock();
  }, [lock]);

  const openChat = useCallback(
    (initial: string) => {
      setChatText(initial);
      chatHistoryIndex.current = -1;
      setOverlay('chat');
      if (document.pointerLockElement) document.exitPointerLock();
    },
    [setOverlay],
  );

  useEffect(() => {
    if (phase !== 'playing') return;
    const down = (e: KeyboardEvent) => {
      const s = sessionRef.current;
      if (!s) return;
      const game = s.game;
      const o = overlayRef.current;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (o === 'chat' || o === 'pause' || o === 'options' || o === 'death') return;
      if (GAME_KEYS.has(e.code) || e.code.startsWith('F')) e.preventDefault();
      if (e.code === 'F3') {
        setDebug((d) => !d);
        return;
      }
      if (e.code === 'F1') {
        hideHudRef.current = !hideHudRef.current;
        setHideHud(hideHudRef.current);
        return;
      }
      if (e.code === 'F5' || e.code === 'KeyV') {
        const next = ((perspectiveRef.current + 1) % 3) as 0 | 1 | 2;
        perspectiveRef.current = next;
        setPerspective(next);
        return;
      }
      if (e.code.startsWith('Digit') && e.code !== 'Digit0') {
        const n = Number(e.code.slice(5)) - 1;
        if (game.screen && hoverSlot.current) {
          game.swapWithHotbar(hoverSlot.current, n);
          refresh();
        } else if (!game.screen) game.selected = n;
        return;
      }
      if (e.code === 'KeyE') {
        if (game.screen) closeScreen();
        else {
          game.openScreen(game.mode === 'creative' ? { kind: 'creative' } : { kind: 'inventory' });
          refresh();
        }
        return;
      }
      if (game.screen) return;
      if (e.code === 'KeyT') {
        e.preventDefault();
        openChat('');
        return;
      }
      if (e.code === 'Slash') {
        openChat('/');
        return;
      }
      if (e.code === 'KeyQ') {
        game.dropHeld(e.ctrlKey || e.metaKey);
        return;
      }
      keys.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => {
      keys.current.clear();
      mouse.current.attack = false;
      mouse.current.use = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [phase, closeScreen, openChat]);

  // Warn before closing the tab mid-game (Ctrl+W is close to the movement keys).
  useEffect(() => {
    if (phase !== 'playing') return;
    const before = (e: BeforeUnloadEvent) => {
      save();
      e.preventDefault();
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [phase, save]);

  // -------------------------------------------------------------------------
  // Mouse
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'playing') return;
    const move = (e: MouseEvent) => {
      const s = sessionRef.current;
      if (!s || document.pointerLockElement !== canvasRef.current) return;
      look(s.game, e.movementX, e.movementY, settingsRef.current.sensitivity);
    };
    const wheel = (e: WheelEvent) => {
      const s = sessionRef.current;
      if (!s || s.game.screen || overlayRef.current) return;
      if (document.pointerLockElement !== canvasRef.current && !touch) return;
      e.preventDefault();
      const dir = Math.sign(e.deltaY);
      s.game.selected = (s.game.selected + dir + 9) % 9;
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('wheel', wheel, { passive: false });
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('wheel', wheel);
    };
  }, [phase, touch]);

  const onCanvasDown = (e: React.PointerEvent) => {
    const s = sessionRef.current;
    if (!s || phase !== 'playing' || e.pointerType === 'touch') return;
    if (document.pointerLockElement !== canvasRef.current) {
      lock();
      return;
    }
    if (e.button === 0) mouse.current.attack = true;
    else if (e.button === 2) mouse.current.use = true;
    else if (e.button === 1) {
      e.preventDefault();
      s.game.pickBlock();
    }
  };
  const onCanvasUp = (e: React.PointerEvent) => {
    if (e.button === 0) mouse.current.attack = false;
    else if (e.button === 2) mouse.current.use = false;
  };

  // -------------------------------------------------------------------------
  // Chat
  // -------------------------------------------------------------------------
  const submitChat = () => {
    const s = sessionRef.current;
    const text = chatText.trim();
    if (s && text) {
      chatHistory.current.push(text);
      if (text.startsWith('/')) {
        const result = s.game.command(text);
        if (result) pushChat(result);
      } else pushChat(`<${t('Player', '玩家')}> ${text}`);
    }
    setChatText('');
    setOverlay(null);
    lock();
  };

  // -------------------------------------------------------------------------
  // Escape (wired to the dialog)
  // -------------------------------------------------------------------------
  const handleEscape = useCallback((): boolean => {
    if (phase === 'worlds' || phase === 'create' || phase === 'options') {
      setPhase(phase === 'create' ? 'worlds' : 'title');
      return true;
    }
    // Never close mid-load; the session is being created.
    if (phase === 'loading') return true;
    if (phase !== 'playing') return false;
    const s = sessionRef.current;
    if (!s) return false;
    const o = overlayRef.current;
    if (s.game.screen) {
      closeScreen();
      return true;
    }
    if (o === 'chat') {
      setOverlay(null);
      lock();
      return true;
    }
    if (o === 'options') {
      setOverlay('pause');
      return true;
    }
    if (o === 'pause') {
      setOverlay(null);
      lock();
      return true;
    }
    if (o === 'death') return true;
    setOverlay('pause');
    if (document.pointerLockElement) document.exitPointerLock();
    return true;
  }, [phase, closeScreen, lock, setOverlay]);

  // Layout effect: the handler must match the phase before the browser can paint it,
  // otherwise an Escape right after `playing` renders would close the dialog.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    (el as HTMLDivElement & { mcEscape?: () => boolean }).mcEscape = handleEscape;
  }, [handleEscape]);

  // -------------------------------------------------------------------------
  // Dev/test hooks
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const w = window as unknown as Record<string, unknown>;
    w.render_game_to_text = () => {
      const s = sessionRef.current;
      if (!s) return JSON.stringify({ phase });
      const g = s.game;
      const p = g.player;
      return JSON.stringify({
        phase,
        overlay: overlayRef.current,
        mode: g.mode,
        time: g.dayTime,
        player: {
          x: Number(p.x.toFixed(2)),
          y: Number(p.y.toFixed(2)),
          z: Number(p.z.toFixed(2)),
          yaw: Number(p.yaw.toFixed(2)),
          pitch: Number(p.pitch.toFixed(2)),
          health: p.health,
          food: p.food,
          onGround: p.onGround,
        },
        selected: g.selected,
        hotbar: g.inventory.slice(0, 9).map((st) => (st ? `${st.id}x${st.count}` : null)),
        screen: g.screen?.kind ?? null,
        target: g.target ? { x: g.target.x, y: g.target.y, z: g.target.z, id: g.target.id } : null,
        entities: g.entities.length,
        chunks: s.renderer.chunksRendered,
      });
    };
    w.mc_debug = () => sessionRef.current;
    return () => {
      delete w.render_game_to_text;
      delete w.mc_debug;
    };
  }, [phase]);

  // -------------------------------------------------------------------------
  // Touch controls
  // -------------------------------------------------------------------------
  const lookTouch = useRef<{
    id: number;
    x: number;
    y: number;
    start: number;
    moved: number;
  } | null>(null);
  const stickTouch = useRef<{ id: number; x: number; y: number } | null>(null);
  const [stick, setStick] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const holdTimer = useRef<number | null>(null);

  const onTouchLookStart = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' || lookTouch.current) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    lookTouch.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      start: performance.now(),
      moved: 0,
    };
    audioRef.current?.resume();
    holdTimer.current = window.setTimeout(() => {
      if (lookTouch.current && lookTouch.current.moved < 12) touchInput.current.attack = true;
    }, 280);
  };
  const onTouchLookMove = (e: React.PointerEvent) => {
    const lt = lookTouch.current;
    const s = sessionRef.current;
    if (!lt || lt.id !== e.pointerId || !s) return;
    const dx = e.clientX - lt.x;
    const dy = e.clientY - lt.y;
    lt.x = e.clientX;
    lt.y = e.clientY;
    lt.moved += Math.abs(dx) + Math.abs(dy);
    look(s.game, dx * 2.2, dy * 2.2, settingsRef.current.sensitivity);
  };
  const onTouchLookEnd = (e: React.PointerEvent) => {
    const lt = lookTouch.current;
    if (!lt || lt.id !== e.pointerId) return;
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    const quick = performance.now() - lt.start < 280 && lt.moved < 12;
    lookTouch.current = null;
    touchInput.current.attack = false;
    if (quick) {
      // Tap: use or place, like Bedrock touch controls.
      touchInput.current.use = true;
      window.setTimeout(() => {
        touchInput.current.use = false;
      }, 120);
    }
  };
  const onStickStart = (e: React.PointerEvent) => {
    if (stickTouch.current) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    stickTouch.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setStick({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
  };
  const onStickMove = (e: React.PointerEvent) => {
    const st = stickTouch.current;
    if (!st || st.id !== e.pointerId) return;
    const max = 48;
    let dx = e.clientX - st.x;
    let dy = e.clientY - st.y;
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    touchInput.current.moveX = dx / max;
    touchInput.current.moveZ = -dy / max;
    touchInput.current.sprint = -dy / max > 0.95;
    setStick({ x: st.x, y: st.y, dx, dy });
  };
  const onStickEnd = (e: React.PointerEvent) => {
    const st = stickTouch.current;
    if (!st || st.id !== e.pointerId) return;
    stickTouch.current = null;
    touchInput.current.moveX = 0;
    touchInput.current.moveZ = 0;
    touchInput.current.sprint = false;
    setStick(null);
  };
  const holdButton = (key: 'jump' | 'sneak') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      if (key === 'sneak') touchInput.current.sneak = !touchInput.current.sneak;
      else touchInput.current.jump = true;
      refresh();
    },
    onPointerUp: () => {
      if (key === 'jump') touchInput.current.jump = false;
    },
    onPointerCancel: () => {
      if (key === 'jump') touchInput.current.jump = false;
    },
  });

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const session = sessionRef.current;
  const game = session?.game ?? null;
  const s = guiScale;

  const menuShell = (title: string, children: React.ReactNode, testId: string) => (
    <div
      className="mc-menu"
      data-testid={testId}
      style={{ backgroundImage: `url(${GAME_ASSETS}menu-bg.png)`, backgroundSize: `${32 * s}px` }}
    >
      <h2
        className="mc-menu-title"
        style={{ fontSize: 8 * s, marginBottom: 12 * s, textShadow: `${s}px ${s}px 0 #3f3f3f` }}
      >
        {title}
      </h2>
      {children}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="mc-game"
      data-testid="minecraft-game"
      data-status={phase}
      data-overlay={overlay ?? ''}
      data-locked={locked ? 'true' : 'false'}
      data-mc-silent={phase === 'playing' ? '' : undefined}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        className="mc-canvas"
        aria-label={t('Minecraft world', 'Minecraft 世界')}
        onPointerDown={onCanvasDown}
        onPointerUp={onCanvasUp}
        style={{ visibility: phase === 'playing' || phase === 'loading' ? 'visible' : 'hidden' }}
      />

      {phase !== 'playing' && phase !== 'loading' ? <Panorama /> : null}
      {phase === 'title' ? (
        <div className="mc-title-screen" data-testid="minecraft-title">
          <div className="mc-logo-wrap" style={{ width: 256 * s, marginTop: 30 * s }}>
            <img
              className="mc-logo mc-pixel"
              src={`${GAME_ASSETS}title.png`}
              alt="Minecraft"
              style={{ width: 256 * s, height: 64 * s }}
            />
            <span className="mc-splash" style={{ fontSize: 8 * s, right: -10 * s, bottom: 6 * s }}>
              {splash}
            </span>
          </div>
          <div className="mc-menu-buttons" style={{ gap: 4 * s, marginTop: 24 * s }}>
            <McButton
              scale={s}
              testId="minecraft-singleplayer"
              onClick={() => {
                setWorlds(listWorlds());
                setPhase('worlds');
              }}
            >
              {t('Singleplayer', '单人游戏')}
            </McButton>
            <McButton scale={s} onClick={() => setPhase('options')}>
              {t('Options...', '选项...')}
            </McButton>
            <McButton scale={s} testId="minecraft-quit" onClick={onExit}>
              {t('Quit Game', '退出游戏')}
            </McButton>
          </div>
          <span
            className="mc-footer-left"
            style={{ fontSize: 8 * s, textShadow: `${s}px ${s}px 0 #3f3f3f` }}
          >
            Minecraft (InferenceX)
          </span>
          <span
            className="mc-footer-right"
            style={{ fontSize: 8 * s, textShadow: `${s}px ${s}px 0 #3f3f3f` }}
          >
            {t('Copyright Mojang AB. Do not distribute!', '版权所有 Mojang AB。请勿分发！')}
          </span>
        </div>
      ) : null}

      {phase === 'worlds'
        ? menuShell(
            t('Select World', '选择世界'),
            <>
              <div
                className="mc-world-list"
                style={{ width: 270 * s, gap: 2 * s, padding: 2 * s }}
                role="listbox"
                aria-label={t('Worlds', '世界')}
              >
                {worlds.length === 0 ? (
                  <p className="mc-muted" style={{ fontSize: 8 * s }}>
                    {t(
                      'No worlds yet. Create one to start playing.',
                      '还没有世界。创建一个即可开始游戏。',
                    )}
                  </p>
                ) : (
                  worlds.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      role="option"
                      aria-selected={selectedWorld === w.id}
                      className={`mc-world${selectedWorld === w.id ? ' mc-world-selected' : ''}`}
                      style={{ fontSize: 8 * s, padding: 3 * s, borderWidth: s }}
                      onClick={() => setSelectedWorld(w.id)}
                      onDoubleClick={() => startWorld(w, loadWorld(w.id))}
                    >
                      <strong>{w.name}</strong>
                      <span>
                        {new Date(w.lastPlayed).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}{' '}
                        · {t('seed', '种子')} {w.seed}
                      </span>
                      <span>
                        {w.mode === 'creative'
                          ? t('Creative Mode', '创造模式')
                          : t('Survival Mode', '生存模式')}{' '}
                        · {w.difficulty}
                      </span>
                    </button>
                  ))
                )}
              </div>
              <div
                className="mc-button-grid"
                style={{ gap: 4 * s, marginTop: 8 * s, width: 308 * s }}
              >
                <McButton
                  scale={s}
                  width={150}
                  disabled={!selectedWorld}
                  testId="minecraft-play-selected"
                  onClick={() => {
                    const w = worlds.find((x) => x.id === selectedWorld);
                    if (w) startWorld(w, loadWorld(w.id));
                  }}
                >
                  {t('Play Selected World', '进入选中的世界')}
                </McButton>
                <McButton
                  scale={s}
                  width={150}
                  testId="minecraft-create-world"
                  onClick={() => {
                    setForm({
                      name: t('New World', '新的世界'),
                      seed: '',
                      mode: 'survival',
                      difficulty: 'normal',
                    });
                    setPhase('create');
                  }}
                >
                  {t('Create New World', '创建新的世界')}
                </McButton>
                <McButton
                  scale={s}
                  width={150}
                  disabled={!selectedWorld}
                  onClick={() => {
                    if (!selectedWorld) return;
                    if (
                      !window.confirm(
                        t(
                          'Delete this world? It will be lost forever.',
                          '删除这个世界？它将永远消失。',
                        ),
                      )
                    )
                      return;
                    deleteWorld(selectedWorld);
                    setSelectedWorld(null);
                    setWorlds(listWorlds());
                  }}
                >
                  {t('Delete', '删除')}
                </McButton>
                <McButton scale={s} width={150} onClick={() => setPhase('title')}>
                  {t('Cancel', '取消')}
                </McButton>
              </div>
            </>,
            'minecraft-worlds',
          )
        : null}

      {phase === 'create'
        ? menuShell(
            t('Create New World', '创建新的世界'),
            <div className="mc-form" style={{ gap: 6 * s, width: 200 * s }}>
              <label style={{ fontSize: 8 * s }}>
                {t('World Name', '世界名称')}
                <McTextField
                  scale={s}
                  label={t('World Name', '世界名称')}
                  value={form.name}
                  onChange={(name) => setForm((f) => ({ ...f, name }))}
                  testId="minecraft-world-name"
                  autoFocus
                />
              </label>
              <label style={{ fontSize: 8 * s }}>
                {t('Seed for the world generator', '世界生成器的种子')}
                <McTextField
                  scale={s}
                  label={t('Seed', '种子')}
                  value={form.seed}
                  onChange={(seed) => setForm((f) => ({ ...f, seed }))}
                  testId="minecraft-world-seed"
                />
              </label>
              <McButton
                scale={s}
                testId="minecraft-mode"
                onClick={() =>
                  setForm((f) => ({ ...f, mode: f.mode === 'survival' ? 'creative' : 'survival' }))
                }
              >
                {t('Game Mode', '游戏模式')}:{' '}
                {form.mode === 'survival' ? t('Survival', '生存') : t('Creative', '创造')}
              </McButton>
              <McButton
                scale={s}
                onClick={() =>
                  setForm((f) => {
                    const order: Difficulty[] = ['peaceful', 'easy', 'normal', 'hard'];
                    return { ...f, difficulty: order[(order.indexOf(f.difficulty) + 1) % 4] };
                  })
                }
              >
                {t('Difficulty', '难度')}: {difficultyLabel(form.difficulty, locale)}
              </McButton>
              <p className="mc-muted" style={{ fontSize: 8 * s }}>
                {form.mode === 'survival'
                  ? t(
                      'Search for resources, craft, gain levels, health and hunger.',
                      '探索资源、合成、获得等级、生命值和饥饿值。',
                    )
                  : t(
                      'Unlimited resources, free flying and destroy blocks instantly.',
                      '无限资源、自由飞行、瞬间破坏方块。',
                    )}
              </p>
              <div
                className="mc-button-grid"
                style={{ gap: 4 * s, width: 308 * s, marginLeft: -54 * s }}
              >
                <McButton
                  scale={s}
                  width={150}
                  testId="minecraft-create-confirm"
                  onClick={() => {
                    const meta = newWorldMeta(
                      form.name || t('New World', '新的世界'),
                      form.seed,
                      form.mode,
                      form.difficulty,
                    );
                    startWorld(meta, null);
                  }}
                >
                  {t('Create New World', '创建新的世界')}
                </McButton>
                <McButton scale={s} width={150} onClick={() => setPhase('worlds')}>
                  {t('Cancel', '取消')}
                </McButton>
              </div>
            </div>,
            'minecraft-create',
          )
        : null}

      {phase === 'options'
        ? menuShell(
            t('Options', '选项'),
            <OptionsPanel
              settings={settings}
              update={updateSettings}
              scale={s}
              locale={locale}
              onDone={() => setPhase('title')}
            />,
            'minecraft-options',
          )
        : null}

      {phase === 'loading' ? (
        <div
          className="mc-menu"
          data-testid="minecraft-loading"
          style={{
            backgroundImage: `url(${GAME_ASSETS}menu-bg.png)`,
            backgroundSize: `${32 * s}px`,
          }}
        >
          <p style={{ fontSize: 8 * s, textShadow: `${s}px ${s}px 0 #3f3f3f` }}>
            {t('Loading terrain', '正在加载地形')}
          </p>
          <div className="mc-progress" style={{ width: 100 * s, height: 2 * s, marginTop: 8 * s }}>
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      ) : null}

      {phase === 'error'
        ? menuShell(
            t('Could not start the game', '无法启动游戏'),
            <>
              <p className="mc-muted" style={{ fontSize: 8 * s, maxWidth: 300 * s }}>
                {t('WebGL is required to play. ', '需要 WebGL 才能游戏。')}
                {errorText}
              </p>
              <McButton scale={s} onClick={() => setPhase('title')}>
                {t('Back to Title Screen', '返回标题屏幕')}
              </McButton>
            </>,
            'minecraft-error',
          )
        : null}

      {phase === 'playing' && game ? (
        <>
          {!hideHud && !game.screen && overlay !== 'pause' && overlay !== 'options' ? (
            <Hud
              game={game}
              scale={s}
              locale={locale}
              chat={chat}
              chatOpen={overlay === 'chat'}
              heldName={heldName}
              debug={debug}
              fps={fps}
              extraDebug={[
                `Chunks: ${session!.renderer.chunksRendered} rendered, ${session!.renderer.meshQueue} queued`,
                `E: ${game.entities.length}`,
                `View: ${['first person', 'third person back', 'third person front'][perspective]}`,
              ]}
            />
          ) : null}
          {game.screen ? (
            <ContainerScreen
              game={game}
              scale={screenScale}
              locale={locale}
              onChange={refresh}
              onHover={(ref) => {
                hoverSlot.current = ref;
              }}
            />
          ) : null}
          {touch && !game.screen && overlay === null ? (
            <div className="mc-touch" data-mc-silent>
              <div
                className="mc-touch-look"
                onPointerDown={onTouchLookStart}
                onPointerMove={onTouchLookMove}
                onPointerUp={onTouchLookEnd}
                onPointerCancel={onTouchLookEnd}
              />
              <div
                className="mc-touch-stick-zone"
                onPointerDown={onStickStart}
                onPointerMove={onStickMove}
                onPointerUp={onStickEnd}
                onPointerCancel={onStickEnd}
              >
                {stick ? (
                  <span className="mc-stick" style={{ left: stick.x - 56, top: stick.y - 56 }}>
                    <span style={{ transform: `translate(${stick.dx}px, ${stick.dy}px)` }} />
                  </span>
                ) : (
                  <span className="mc-stick-hint">{t('Move', '移动')}</span>
                )}
              </div>
              <div className="mc-touch-buttons">
                <button type="button" aria-label={t('Jump', '跳跃')} {...holdButton('jump')}>
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={t('Sneak', '潜行')}
                  aria-pressed={touchInput.current.sneak}
                  {...holdButton('sneak')}
                >
                  ●
                </button>
              </div>
              <div className="mc-touch-top">
                <button
                  type="button"
                  onClick={() => {
                    game.openScreen(
                      game.mode === 'creative' ? { kind: 'creative' } : { kind: 'inventory' },
                    );
                    refresh();
                  }}
                >
                  {t('Inventory', '物品栏')}
                </button>
                <button type="button" onClick={() => openChat('/')}>
                  {t('Chat', '聊天')}
                </button>
                <button type="button" onClick={() => setOverlay('pause')}>
                  {t('Pause', '暂停')}
                </button>
              </div>
              <div className="mc-touch-hotbar" style={{ width: 182 * s, height: 22 * s }}>
                {Array.from({ length: 9 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`${t('Hotbar slot', '快捷栏槽位')} ${i + 1}`}
                    style={{ left: i * 20 * s, width: 22 * s, height: 22 * s }}
                    onClick={() => {
                      game.selected = i;
                      refresh();
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {!touch && !locked && !game.screen && overlay === null ? (
            <button
              type="button"
              className="mc-click-to-play"
              onClick={lock}
              style={{ fontSize: 8 * s }}
            >
              {t('Click to play', '点击开始游戏')}
            </button>
          ) : null}
          {overlay === 'chat' ? (
            <form
              className="mc-chat-input"
              style={{ height: 12 * s, fontSize: 8 * s }}
              onSubmit={(e) => {
                e.preventDefault();
                submitChat();
              }}
            >
              <input
                autoFocus
                value={chatText}
                aria-label={t('Chat', '聊天')}
                data-testid="minecraft-chat"
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const h = chatHistory.current;
                    if (h.length === 0) return;
                    let i = chatHistoryIndex.current;
                    i =
                      e.key === 'ArrowUp'
                        ? i < 0
                          ? h.length - 1
                          : Math.max(0, i - 1)
                        : i < 0
                          ? -1
                          : i + 1;
                    if (i >= h.length) i = -1;
                    chatHistoryIndex.current = i;
                    setChatText(i < 0 ? '' : h[i]);
                  }
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    setChatText((v) => completeCommand(v));
                  }
                }}
              />
            </form>
          ) : null}
          {overlay === 'pause' ? (
            <div className="mc-pause" data-testid="minecraft-pause">
              <h2
                style={{
                  fontSize: 8 * s,
                  textShadow: `${s}px ${s}px 0 #3f3f3f`,
                  marginBottom: 16 * s,
                }}
              >
                {t('Game Menu', '游戏菜单')}
              </h2>
              <div className="mc-menu-buttons" style={{ gap: 4 * s }}>
                <McButton
                  scale={s}
                  testId="minecraft-resume"
                  onClick={() => {
                    setOverlay(null);
                    lock();
                  }}
                >
                  {t('Back to Game', '回到游戏')}
                </McButton>
                <McButton scale={s} onClick={() => setOverlay('options')}>
                  {t('Options...', '选项...')}
                </McButton>
                <McButton
                  scale={s}
                  onClick={() => {
                    const el = rootRef.current;
                    if (!el) return;
                    if (document.fullscreenElement) void document.exitFullscreen();
                    else
                      void el.requestFullscreen?.().then(() => {
                        const kb = (
                          navigator as unknown as {
                            keyboard?: { lock?: (keys?: string[]) => Promise<void> };
                          }
                        ).keyboard;
                        void kb
                          ?.lock?.([
                            'KeyW',
                            'KeyA',
                            'KeyS',
                            'KeyD',
                            'Escape',
                            'Space',
                            'ControlLeft',
                          ])
                          .catch(() => undefined);
                      });
                  }}
                >
                  {t('Toggle Fullscreen', '切换全屏')}
                </McButton>
                <McButton
                  scale={s}
                  testId="minecraft-save-quit"
                  onClick={() => {
                    endSession(true);
                    setOverlay(null);
                    setPhase('title');
                  }}
                >
                  {t('Save and Quit to Title', '保存并退回到标题屏幕')}
                </McButton>
                <McButton
                  scale={s}
                  testId="minecraft-exit"
                  onClick={() => {
                    endSession(true);
                    onExit();
                  }}
                >
                  {t('Save and Return to InferenceX', '保存并返回 InferenceX')}
                </McButton>
              </div>
              {saveNote ? (
                <p className="mc-muted" style={{ fontSize: 8 * s, marginTop: 8 * s }}>
                  {saveNote}
                </p>
              ) : null}
              <p
                className="mc-muted mc-controls"
                style={{ fontSize: 8 * s, marginTop: 12 * s, maxWidth: 360 * s }}
              >
                {t(
                  'WASD move · Space jump (double-tap to fly in creative) · Shift sneak · R or double-tap W sprint · E inventory · Q drop · 1-9 or wheel select · Left click break/attack · Right click place/use · Middle click pick block · T chat, / commands · F3 debug · F5 or V camera · F1 hide HUD',
                  'WASD 移动 · 空格跳跃（创造模式双击飞行）· Shift 潜行 · R 或双击 W 疾跑 · E 物品栏 · Q 丢弃 · 1-9 或滚轮选择 · 左键破坏/攻击 · 右键放置/使用 · 中键选取方块 · T 聊天，/ 命令 · F3 调试 · F5 或 V 视角 · F1 隐藏界面',
                )}
              </p>
            </div>
          ) : null}
          {overlay === 'options' ? (
            <div className="mc-pause" data-testid="minecraft-ingame-options">
              <h2
                style={{
                  fontSize: 8 * s,
                  textShadow: `${s}px ${s}px 0 #3f3f3f`,
                  marginBottom: 12 * s,
                }}
              >
                {t('Options', '选项')}
              </h2>
              <OptionsPanel
                settings={settings}
                update={updateSettings}
                scale={s}
                locale={locale}
                onDone={() => setOverlay('pause')}
                difficulty={game.difficulty}
                onDifficulty={(d) => {
                  game.difficulty = d;
                  refresh();
                }}
              />
            </div>
          ) : null}
          {overlay === 'death' ? (
            <div className="mc-death" data-testid="minecraft-death">
              <h2 style={{ fontSize: 16 * s, textShadow: `${2 * s}px ${2 * s}px 0 #3f3f3f` }}>
                {t('You Died!', '你死了！')}
              </h2>
              <p style={{ fontSize: 8 * s, margin: `${8 * s}px 0` }}>
                {t('Player', '玩家')} {game.player.deathMessage}
              </p>
              <p style={{ fontSize: 8 * s, marginBottom: 16 * s }}>
                {t('Score', '分数')}: <span style={{ color: '#ffff55' }}>{game.player.level}</span>
              </p>
              <div className="mc-menu-buttons" style={{ gap: 4 * s }}>
                <McButton
                  scale={s}
                  testId="minecraft-respawn"
                  onClick={() => {
                    game.respawn();
                    setOverlay(null);
                    lock();
                  }}
                >
                  {t('Respawn', '重生')}
                </McButton>
                <McButton
                  scale={s}
                  onClick={() => {
                    game.respawn();
                    endSession(true);
                    setOverlay(null);
                    setPhase('title');
                  }}
                >
                  {t('Title Screen', '标题屏幕')}
                </McButton>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function OptionsPanel({
  settings,
  update,
  scale,
  locale,
  onDone,
  difficulty,
  onDifficulty,
}: {
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  scale: number;
  locale: Locale;
  onDone: () => void;
  difficulty?: Difficulty;
  onDifficulty?: (d: Difficulty) => void;
}) {
  const s = scale;
  const t = (en: string, zh: string) => tr(locale, en, zh);
  const [soundOn, setSoundOn] = useState(() => {
    try {
      return localStorage.getItem('minecraft-sound') !== 'false';
    } catch {
      return true;
    }
  });
  return (
    <>
      <div className="mc-button-grid" style={{ gap: 4 * s, width: 308 * s }}>
        <McSlider
          scale={s}
          label={t('FOV', '视场角')}
          value={settings.fov}
          min={30}
          max={110}
          step={1}
          format={(v) => (v === 70 ? t('Normal', '普通') : String(v))}
          onChange={(fov) => update({ fov })}
        />
        <McSlider
          scale={s}
          label={t('Render Distance', '渲染距离')}
          value={settings.renderDistance}
          min={2}
          max={12}
          step={1}
          format={(v) => t(`${v} chunks`, `${v} 个区块`)}
          onChange={(renderDistance) => update({ renderDistance })}
        />
        <McSlider
          scale={s}
          label={t('Sensitivity', '灵敏度')}
          value={settings.sensitivity}
          min={0}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 200)}%`}
          onChange={(sensitivity) => update({ sensitivity })}
        />
        <McSlider
          scale={s}
          label={t('Brightness', '亮度')}
          value={settings.gamma}
          min={0}
          max={1}
          step={0.01}
          format={(v) =>
            v === 0
              ? t('Moody', '昏暗')
              : v === 1
                ? t('Bright', '明亮')
                : `+${Math.round(v * 100)}%`
          }
          onChange={(gamma) => update({ gamma })}
        />
        <McSlider
          scale={s}
          label={t('Volume', '音量')}
          value={settings.volume}
          min={0}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(volume) => update({ volume })}
        />
        <McButton
          scale={s}
          width={150}
          onClick={() => {
            const next = !soundOn;
            setSoundOn(next);
            try {
              localStorage.setItem('minecraft-sound', String(next));
            } catch {
              /* storage unavailable */
            }
            window.dispatchEvent(new CustomEvent('minecraft-sound-toggle'));
          }}
        >
          {t('Sounds', '声音')}: {soundOn ? t('ON', '开') : t('OFF', '关')}
        </McButton>
        <McButton
          scale={s}
          width={150}
          onClick={() => update({ viewBobbing: !settings.viewBobbing })}
        >
          {t('View Bobbing', '视角摇晃')}: {settings.viewBobbing ? t('ON', '开') : t('OFF', '关')}
        </McButton>
        <McButton scale={s} width={150} onClick={() => update({ clouds: !settings.clouds })}>
          {t('Clouds', '云')}: {settings.clouds ? t('ON', '开') : t('OFF', '关')}
        </McButton>
        {difficulty && onDifficulty ? (
          <McButton
            scale={s}
            width={150}
            onClick={() => {
              const order: Difficulty[] = ['peaceful', 'easy', 'normal', 'hard'];
              onDifficulty(order[(order.indexOf(difficulty) + 1) % 4]);
            }}
          >
            {t('Difficulty', '难度')}: {difficultyLabel(difficulty, locale)}
          </McButton>
        ) : null}
      </div>
      <div style={{ marginTop: 12 * s }}>
        <McButton scale={s} onClick={onDone} testId="minecraft-options-done">
          {t('Done', '完成')}
        </McButton>
      </div>
    </>
  );
}

function difficultyLabel(d: Difficulty, locale: Locale) {
  const zh: Record<Difficulty, string> = {
    peaceful: '和平',
    easy: '简单',
    normal: '普通',
    hard: '困难',
  };
  const en: Record<Difficulty, string> = {
    peaceful: 'Peaceful',
    easy: 'Easy',
    normal: 'Normal',
    hard: 'Hard',
  };
  return locale === 'zh' ? zh[d] : en[d];
}

const COMMANDS = [
  '/gamemode',
  '/time',
  '/tp',
  '/give',
  '/difficulty',
  '/seed',
  '/kill',
  '/summon',
  '/spawnpoint',
  '/clear',
  '/help',
];
function completeCommand(text: string) {
  if (!text.startsWith('/') || text.includes(' ')) {
    const parts = text.split(' ');
    if (parts[0] === '/give' && parts.length === 2) {
      const match = Object.keys(ITEMS).find((id) => id.startsWith(parts[1]));
      if (match) return `/give ${match}`;
    }
    if (parts[0] === '/summon' && parts.length === 2) {
      const match = ['zombie', 'creeper', 'skeleton', 'pig', 'cow', 'sheep', 'chicken', 'tnt'].find(
        (id) => id.startsWith(parts[1]),
      );
      if (match) return `/summon ${match}`;
    }
    return text;
  }
  return COMMANDS.find((c) => c.startsWith(text)) ?? text;
}

/** Mouse look with vanilla's sensitivity curve. */
function look(game: Game, dx: number, dy: number, sensitivity: number) {
  const f = sensitivity * 0.6 + 0.2;
  const k = f * f * f * 8 * 0.15 * (Math.PI / 180);
  const p = game.player;
  p.yaw -= dx * k;
  p.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, p.pitch - dy * k));
}

function isSolidBlock(game: Game, x: number, y: number, z: number) {
  const id = game.world.getBlock(x, y, z);
  return id !== 0 && Boolean(BLOCK_SOLID[id]);
}
const BLOCK_SOLID: boolean[] = BLOCKS.map((b) => Boolean(b?.solid));

export default MinecraftGame;
