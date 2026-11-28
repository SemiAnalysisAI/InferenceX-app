'use client';
import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useLocale } from '@/lib/i18n/use-locale';
import './backyard.css';
import { paperSynth } from './paper-synth';
import SouthParkToggles from './south-park-toggles';
import { KeepParty } from './keep-party';

const art = '/decorative/south-park/art/';
const en = {
  book: 'Kupa Keep · Backyard quest',
  title: 'The Stick of Cache',
  intro:
    'The gnomes borrowed the kingdom’s KV blocks. Cartman wants his pretend stick back. Read their next move before taking your turn.',
  crew: 'Wizard Cartman',
  enemy: 'Underpants Gnomes',
  heart: 'Hearts',
  focus: 'Focus',
  turn: 'Turn',
  intents: [
    'Raid: 2 incoming. Guard to store 2 focus.',
    'Doing the books: no counterattack. An opening for a batch!',
    'Pickpocket: 1 incoming. A single toss recovers 1 focus.',
  ],
  moves: ['Cardboard shield', 'Single snowball', 'Batch of snowballs'],
  costs: ['Block +2 focus', '1 hit +1 focus', '3 hits · costs 2 focus'],
  opening: 'Cartman: “I’m not fat, I’m big-boned!” The cardboard breastplate does not fit.',
  results: [
    'Blocked the raid. Nobody touched the cache.',
    'A snowball knocks one block loose.',
    'Three snowballs reclaim three blocks.',
  ],
  moral: 'Stan: “You know, I’ve learned something today...” Measure the wait, not just the batch.',
  stamp: 'Friend badge earned · start future non-lab shifts with 2 extra tickets.',
  loss: 'The gnomes kept the stick. Watch the raid telegraph and save focus for the opening.',
  again: 'Rematch',
  back: 'Back to the arcade',
  guide: 'Gnomes’ next move',
  status: 'Quest feed',
  follow: 'Take the sled to Stark’s Pond',
  resume: 'Return to raid night',
};
const zh: typeof en = {
  book: '库帕堡 · 后院任务',
  title: '缓存之杖',
  intro:
    '内裤侏儒借走了王国的 KV 缓存块。卡特曼想拿回他的玩具法杖。先看对手的预告，再决定这一回合怎么走。',
  crew: '法师卡特曼',
  enemy: '内裤侏儒',
  heart: '体力',
  focus: '专注',
  turn: '回合',
  intents: [
    '突袭：将造成 2 点伤害。举盾格挡并存下 2 点专注。',
    '算账：本回合不反击，可以批量投掷！',
    '扒窃：将造成 1 点伤害。单发雪球可恢复 1 点专注。',
  ],
  moves: ['纸板盾', '单发雪球', '批量雪球'],
  costs: ['格挡并加 2 专注', '1 点伤害，加 1 专注', '3 点伤害，耗 2 专注'],
  opening: '卡特曼：“我不是胖，我只是骨架大！”那件纸板胸甲穿不下。',
  results: ['挡住了袭击，缓存安然无恙。', '一个雪球打落了一块缓存。', '三个雪球夺回三块缓存。'],
  moral: '斯坦：“今天我学到了一件事……”别只看批次，也要测量等待时间。',
  stamp: '已获好友徽章 · 往后的非实验室班次开局多两张车票。',
  loss: '侏儒保住了法杖。留意突袭预告，存好专注再出手。',
  again: '再战一局',
  back: '返回游戏厅',
  guide: '侏儒的下一步',
  status: '任务动态',
  follow: '带上雪橇前往斯塔克池塘',
  resume: '回到团战之夜',
};
const fresh = { hp: 5, foe: 7, fp: 0, turn: 0, move: -1 };
// Combat is event driven. The optional paper soundtrack stops when the dialog closes.
export default function Backyard({
  onClose,
  onStamp,
}: {
  onClose: () => void;
  onStamp: () => void;
}) {
  const chinese = useLocale() === 'zh',
    t = chinese ? zh : en,
    other = chinese ? en : zh;
  const [s, set] = useState(fresh),
    [act, setAct] = useState<1 | 2 | 3>(1),
    [unlocked, setUnlocked] = useState(1);
  const fx = useRef<ReturnType<typeof paperSynth> | null>(null);
  useEffect(() => {
    const audio = paperSynth(true);
    try {
      setUnlocked(
        Math.min(
          3,
          Math.max(
            Number(localStorage.getItem('south-park-party-chapter')) || 1,
            localStorage.getItem('south-park-keep-stamp') === '1' ? 2 : 1,
          ),
        ),
      );
    } catch {}
    fx.current = audio;
    const sync = () => audio.sync(),
      visibility = () => {
        if (document.hidden) audio.pause();
      };
    window.addEventListener('south-park-sound-toggle', sync);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('south-park-sound-toggle', sync);
      document.removeEventListener('visibilitychange', visibility);
      audio.dispose();
      fx.current = null;
    };
  }, []);
  const phase = s.turn % 3,
    ended = !s.hp || !s.foe;
  function takeTurn(m: number) {
    if (ended || (m === 2 && s.fp < 2)) return;
    const foe = Math.max(0, s.foe - [0, 1, 3][m]);
    const hp = foe && m ? Math.max(0, s.hp - [2, 0, 1][phase]) : s.hp;
    const audio = fx.current;
    audio?.activate();
    audio?.drive((7 - foe) * 8, s.turn, 1);
    audio?.cue(
      foe === 0 ? 'wave' : hp === 0 ? 'miss' : m === 0 ? 'snip' : m === 1 ? 'crunch' : 'dispatch',
    );
    set({ hp, foe, fp: Math.min(4, s.fp + [2, 1, -2][m]), turn: s.turn + 1, move: m });
    if (!foe) {
      onStamp();
      setUnlocked((v) => Math.max(2, v));
      try {
        localStorage.setItem('south-park-keep-stamp', '1');
      } catch {}
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sp-keep" onCloseAutoFocus={(e) => e.preventDefault()}>
        <header>
          <small>{t.book}</small>
          <DialogTitle>{t.title}</DialogTitle>
          <SouthParkToggles room />
        </header>
        {act === 2 || act === 3 ? (
          <KeepParty
            key={act}
            act={act}
            chinese={chinese}
            onAct={setAct}
            onClose={onClose}
            cue={(kind) => {
              fx.current?.activate();
              fx.current?.drive(26, 1, act);
              fx.current?.cue(kind);
            }}
          />
        ) : (
          <>
            <div className="sp-fort">
              <img src={`${art}fort.webp`} alt="" />
              <b>
                {t.turn} {s.turn + 1}
              </b>
            </div>
            <DialogDescription>{t.intro}</DialogDescription>
            <div
              className="sp-pair"
              key={s.turn}
              data-impact={s.move < 0 ? undefined : s.move === 0 ? 'guard' : 'hit'}
            >
              <div>
                <img src={`${art}wizard.webp`} alt="" />
                <span>
                  <b>{t.crew}</b>
                  <small>
                    {t.heart} {s.hp}/5 · {t.focus} {s.fp}/4
                  </small>
                </span>
              </div>
              <div>
                <img src={`${art}gnomes.webp`} alt="" />
                <span>
                  <b>{t.enemy}</b>
                  <small>
                    {t.heart} {s.foe}/7
                  </small>
                </span>
              </div>
            </div>
            <div
              className="sp-quest-feed"
              role="status"
              aria-label={t.status}
              data-keep-state={s.foe === 0 ? 'won' : s.hp === 0 ? 'lost' : 'turn'}
            >
              <p>
                {s.foe === 0
                  ? t.moral
                  : s.hp === 0
                    ? t.loss
                    : s.move < 0
                      ? t.opening
                      : t.results[s.move]}
              </p>
              {(s.move < 0 || !s.foe) && (
                <small className="sp-quest-cc" lang={chinese ? 'en' : 'zh'}>
                  {s.move < 0 ? other.opening : other.moral}
                </small>
              )}
              {s.foe === 0 ? (
                <strong>{t.stamp}</strong>
              ) : (
                !ended && (
                  <strong>
                    {t.guide}: {t.intents[phase]}
                  </strong>
                )
              )}
            </div>
            {!ended && (
              <div className="sp-quest-moves">
                {t.moves.map((m, i) => (
                  <button
                    key={m}
                    data-keep-move={i}
                    type="button"
                    disabled={i === 2 && s.fp < 2}
                    onClick={() => takeTurn(i)}
                  >
                    <b>{m}</b>
                    <small>{t.costs[i]}</small>
                  </button>
                ))}
              </div>
            )}
            <footer>
              {unlocked >= 2 && (
                <button
                  type="button"
                  data-keep-next=""
                  onClick={() => setAct(unlocked >= 3 ? 3 : 2)}
                >
                  {unlocked >= 3 ? t.resume : t.follow}
                </button>
              )}
              {ended && (
                <button type="button" onClick={() => set(fresh)}>
                  {t.again}
                </button>
              )}
              <button type="button" onClick={onClose}>
                {t.back}
              </button>
            </footer>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
