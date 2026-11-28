'use client';
import { useEffect, useRef, useState } from 'react';
import { DialogDescription } from '@/components/ui/dialog';

const art = '/decorative/south-park/art/';
const en = {
  titles: ['The Pond Crossing', 'Raid Night at the Marsh House'],
  crews: ['Stan and Kyle', 'Wizard Cartman’s party'],
  locations: ['Stark’s Pond', 'The basement griefer'],
  briefs: [
    'Get six cache blocks across in five crossings. A single sled carries one block. A double carries two, but breaks through thin ice. Kyle brought one rope bridge.',
    'The griefer has four ward layers. Stan stores guard, Kyle spends it during a channel to open the ward, and Cartman can knock two layers off an open ward. An unguarded rush costs one heart.',
  ],
  pond: ['Thin ice', 'Firm ice'],
  raid: ['Rush incoming', 'Channeling a ward', 'Cast window'],
  pondMoves: ['Send one sled', 'Hitch two sleds', 'Use rope bridge'],
  pondCosts: ['1 block', '2 on firm ice', '2 blocks · one use'],
  raidMoves: ['Stan: draw aggro', 'Kyle: interrupt', 'Cartman: cast'],
  raidCosts: ['Block +1 guard', 'Channel · costs 1 guard', '2 hits on open ward'],
  load: 'Blocks across',
  layers: 'Ward layers',
  rope: 'Bridges',
  guard: 'Guard',
  hearts: 'Hearts',
  turn: 'Turn',
  next: 'Next',
  pondWin: 'All six blocks came ashore. Stan has a raid invitation.',
  pondLoss: 'The ice closed before the crates arrived. Try the rope on a thin crossing.',
  raidWin: 'The party logged off together. The cache staff is back at Kupa Keep.',
  raidLoss: 'The tank went down. Let Stan take the rush, then spend guard on the channel.',
  pondNotes: [
    'One crate is ashore.',
    'Two crates made the crossing.',
    'The ice gave way. No crates delivered.',
    'The rope took the weight of both crates.',
  ],
  raidNotes: [
    'Stan holds the front line.',
    'Kyle interrupts the channel. The ward opens for the next cast.',
    'Two ward layers fall.',
    'The cast bounced off the ward.',
  ],
  continue: 'Visit the Marsh house',
  retry: 'Try this stop again',
  back: 'Back to the arcade',
};
const zh: typeof en = {
  titles: ['冰湖运货', '马什家团战之夜'],
  crews: ['斯坦和凯尔', '法师卡特曼小队'],
  locations: ['斯塔克池塘', '地下室的捣乱玩家'],
  briefs: [
    '五趟内运过六块缓存。单橇运一块，双橇运两块，但会压破薄冰。凯尔带了一座只能用一次的绳桥。',
    '对手有四层护盾。斯坦吸引火力可积攒守备，凯尔在引导时消耗守备打断施法，卡特曼能在破绽期打掉两层护盾。正面突袭若无人抵挡则损失一颗心。',
  ],
  pond: ['薄冰', '厚冰'],
  raid: ['即将突袭', '正在引导护盾', '施法窗口'],
  pondMoves: ['派出单橇', '连接双橇', '放下绳桥'],
  pondCosts: ['运一块', '厚冰上运两块', '运两块 · 限用一次'],
  raidMoves: ['斯坦：吸引火力', '凯尔：打断', '卡特曼：施法'],
  raidCosts: ['格挡并加一守备', '引导时耗一守备', '破盾后打落两层'],
  load: '已运缓存',
  layers: '护盾层数',
  rope: '绳桥',
  guard: '守备',
  hearts: '体力',
  turn: '回合',
  next: '下一步',
  pondWin: '六块缓存已上岸。斯坦收到了一封组队邀请。',
  pondLoss: '水道冻住了，货还没到齐。下次试试在薄冰上用绳桥。',
  raidWin: '小队一起下线了，缓存法杖也回到了库帕堡。',
  raidLoss: '前排倒下了。让斯坦挡住突袭，再让凯尔消耗守备打断引导。',
  pondNotes: [
    '一块缓存已上岸。',
    '两块缓存都到了对岸。',
    '冰面塌了，这趟没送到。',
    '绳桥撑住了两块缓存。',
  ],
  raidNotes: [
    '斯坦稳住了前排。',
    '凯尔打断引导，下次施法可以击穿护盾。',
    '护盾掉了两层。',
    '法术被护盾弹开了。',
  ],
  continue: '前往马什家',
  retry: '重试此站',
  back: '返回游戏厅',
};
const ice = [0, 1, 0, 0, 1];
const fresh = { turn: 0, crates: 0, rope: 1, guard: 0, hp: 3, ward: 4, exposed: false, note: -1 };
export function KeepParty({
  act,
  chinese,
  onAct,
  onClose,
  cue,
}: {
  act: 2 | 3;
  chinese: boolean;
  onAct: (act: 2 | 3) => void;
  onClose: () => void;
  cue: (kind: 'dispatch' | 'crunch' | 'wave' | 'miss') => void;
}) {
  const t = chinese ? zh : en,
    pond = act === 2,
    chapter = act - 2;
  const [s, set] = useState(fresh),
    label = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    label.current?.focus({ preventScroll: true });
  }, []);
  const phase = s.turn % 3,
    win = pond ? s.crates >= 6 : s.ward === 0,
    loss = !win && (pond ? s.turn >= 5 : s.hp <= 0),
    ended = win || loss;
  function play(i: number) {
    if (ended) return;
    const v = { ...s, turn: s.turn + 1 };
    if (pond) {
      if (i === 2 && !s.rope) return;
      const add = i === 0 ? 1 : i === 2 || ice[s.turn] === 1 ? 2 : 0;
      v.crates = Math.min(6, s.crates + add);
      v.rope -= i === 2 ? 1 : 0;
      v.note = i === 2 ? 3 : i === 0 ? 0 : add ? 1 : 2;
    } else {
      if (i === 1 && (phase !== 1 || !s.guard)) return;
      v.exposed = i === 1;
      if (i === 0) v.guard = Math.min(2, s.guard + 1);
      if (i === 1) v.guard--;
      if (i === 2 && s.exposed) v.ward = Math.max(0, s.ward - 2);
      if (phase === 0 && i !== 0) v.hp--;
      v.note = i === 2 && !s.exposed ? 3 : i;
    }
    const won = pond ? v.crates >= 6 : !v.ward;
    cue(
      won ? 'wave' : v.hp <= 0 || (pond && v.note === 2) ? 'miss' : i === 0 ? 'crunch' : 'dispatch',
    );
    if (won)
      try {
        localStorage.setItem('south-park-party-chapter', String(pond ? 3 : 4));
      } catch {}
    set(v);
  }
  return (
    <>
      <div className="sp-fort">
        <img src={`${art}${pond ? 'pond' : 'marsh'}.webp`} alt="" />
        <b>{act} / 3</b>
      </div>
      <h3 ref={label} tabIndex={-1} className="sp-party-title">
        {t.titles[chapter]}
      </h3>
      <DialogDescription>{t.briefs[chapter]}</DialogDescription>
      <div
        className="sp-pair"
        data-impact={s.note < 0 ? undefined : s.note === 0 ? 'guard' : 'hit'}
        key={s.turn}
      >
        <div>
          <img src={`${art}${pond ? 'stan-ski' : 'wizard'}.webp`} alt="" />
          <span>
            <b>{t.crews[chapter]}</b>
            <small>
              {pond ? `${t.rope}: ${s.rope}` : `${t.hearts}: ${s.hp}/3 · ${t.guard}: ${s.guard}/2`}
            </small>
          </span>
        </div>
        <div>
          <img src={`${art}${pond ? 'kyle-ski' : 'gamer'}.webp`} alt="" />
          <span>
            <b>{t.locations[chapter]}</b>
            <small>{pond ? `${t.load}: ${s.crates}/6` : `${t.layers}: ${s.ward}/4`}</small>
          </span>
        </div>
      </div>
      <div
        role="status"
        aria-live="polite"
        className="sp-quest-feed"
        data-party-act={act}
        data-party-state={win ? 'won' : loss ? 'lost' : 'turn'}
      >
        {s.note >= 0 && <p>{(pond ? t.pondNotes : t.raidNotes)[s.note]}</p>}
        <strong>
          {win
            ? pond
              ? t.pondWin
              : t.raidWin
            : loss
              ? pond
                ? t.pondLoss
                : t.raidLoss
              : `${t.turn} ${s.turn + 1} · ${t.next}: ${pond ? t.pond[ice[s.turn]] : t.raid[phase]}`}
        </strong>
      </div>
      {!ended && (
        <div className="sp-quest-moves">
          {(pond ? t.pondMoves : t.raidMoves).map((m, i) => (
            <button
              type="button"
              key={m}
              data-party-move={i}
              disabled={pond ? i === 2 && !s.rope : i === 1 && (phase !== 1 || s.guard === 0)}
              onClick={() => play(i)}
            >
              <b>{m}</b>
              <small>{(pond ? t.pondCosts : t.raidCosts)[i]}</small>
            </button>
          ))}
        </div>
      )}
      <footer>
        {win && pond && (
          <button type="button" data-party-next="" onClick={() => onAct(3)}>
            {t.continue}
          </button>
        )}
        {ended && (
          <button
            type="button"
            onClick={() => {
              set(fresh);
              label.current?.focus();
            }}
          >
            {t.retry}
          </button>
        )}
        <button type="button" onClick={onClose}>
          {t.back}
        </button>
      </footer>
    </>
  );
}
