'use client';
import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ART, STRINGS, type Copy } from './strings';
export default function PrankFile({
  copy,
  found,
  onTry,
  onClose,
}: {
  copy: Copy;
  found: string[];
  onTry: (i: number) => void;
  onClose: () => void;
}) {
  const trigger = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const [last, setLast] = useState(-1);
  const stamps = [
    'homer',
    'bart-ollie',
    'bart-board',
    'lisa-sax',
    'couch-family',
    'donut',
    'nelson',
    'school',
  ];
  const zh = copy === STRINGS.zh,
    earned = found.filter((s) => s.startsWith('egg')).length;
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        className="simpsons-dossier"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          trigger.current?.focus();
        }}
      >
        <div className="sp-file-head">
          <img alt="" src={`${ART}bart-board.webp`} />
          <div>
            <small>{copy.dossierSub}</small>
            <DialogTitle>{copy.dossier}</DialogTitle>
            <DialogDescription>
              {copy.found}: {found.filter((k) => k.startsWith('egg')).length}/8 · {copy.gagsLogged}:{' '}
              {found.filter((k) => k.startsWith('gag')).length}/7
            </DialogDescription>
          </div>
        </div>
        <div className="sp-tour-intro" aria-live="polite">
          <strong>
            {zh ? '春田镇集邮之旅' : 'Springfield stamp tour'} · {earned}/8
          </strong>
          <p>
            {earned === 8
              ? zh
                ? '特辑已解锁。在首页看沙发终场，在图表看莉萨的报道。'
                : 'Special unlocked. Tune in at home for the couch sign-off, or on a chart for Lisa’s field report.'
              : zh
                ? '按线索在网站上找彩蛋，或在下方重演。集齐八枚邮戳解锁当地电视特辑。'
                : 'Follow each clue on the site, or replay the stop below. Eight stamps unlock a local TV special.'}
          </p>
          {last >= 0 && (
            <small>
              {zh ? '已盖章' : 'Stamped'}: {copy.secrets[last]}
            </small>
          )}
        </div>
        <div className="sp-file-list">
          {copy.secrets.map((s, i) => (
            <button
              key={s}
              type="button"
              data-done={found.includes(`egg${i}`)}
              onClick={() => {
                onTry(i);
                setLast(i);
              }}
            >
              <img className="sp-postmark" src={`${ART}${stamps[i]}.webp`} alt="" />
              <span>
                <strong>{s}</strong>
                <small>{copy.clues[i]}</small>
              </span>
              <i>{found.includes(`egg${i}`) ? (zh ? '已盖章' : 'Stamped') : copy.tryIt} ▸</i>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
