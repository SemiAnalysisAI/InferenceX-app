'use client';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useLocale } from '@/lib/i18n/use-locale';
import { CaseProp } from './case-prop';
import { STRINGS } from './strings';
import { COUNTY_LINES, readLines, type CountyLine } from './county-lines';
export default function CaseDrawer({
  mask,
  patrol,
  onPatrol,
  onClose,
}: {
  mask: number;
  patrol: boolean;
  onPatrol: () => void;
  onClose: () => void;
}) {
  const locale = useLocale(),
    t = STRINGS[locale],
    found = new Set(readLines());
  const count = mask.toString(2).replaceAll('0', '').length;
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        className="sp-drawer"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          document.querySelector<HTMLButtonElement>('[data-sp-drawer]')?.focus();
        }}
      >
        <small>{t.docket}</small>
        <DialogTitle>{t.drawer}</DialogTitle>
        <DialogDescription>
          {t.filed} · {count} / 12
        </DialogDescription>
        <details className="sp-line-file">
          <summary>
            {locale === 'zh' ? '现场语录档案' : 'Field desk • lines found'} {found.size}/
            {Object.keys(COUNTY_LINES).length}
          </summary>
          <ul>
            {(Object.keys(COUNTY_LINES) as CountyLine[]).map((id, i) => (
              <li key={id}>
                <b>{String(i + 1).padStart(2, '0')}</b>{' '}
                {found.has(id)
                  ? COUNTY_LINES[id][locale === 'zh' ? 1 : 0]
                  : locale === 'zh'
                    ? '尚未听见'
                    : 'Not heard yet'}
                {found.has(id) && locale === 'zh' && (
                  <small lang="en"> {COUNTY_LINES[id][0]}</small>
                )}
              </li>
            ))}
          </ul>
        </details>
        <section className="sp-patrol-reward">
          {count >= 8 && <img src="/decorative/south-park/art/the-coon.webp" alt="" />}
          <span>
            <b>{t.patrolName}</b>
            <small>{count >= 8 ? t.patrolWon : `${t.patrolNeed} · ${count}/8`}</small>
          </span>
          {count >= 8 && (
            <button type="button" data-sp-patrol="" aria-pressed={patrol} onClick={onPatrol}>
              {patrol ? t.patrolOff : t.patrolOn}
            </button>
          )}
        </section>
        <ol>
          {t.cases.map((c, i) => (
            <li key={c} data-filed={Boolean(mask & (1 << i))}>
              <span>
                <CaseProp id={i} />
              </span>
              <div>
                <small>KM / {String(i + 1).padStart(2, '0')}</small>
                <b>{mask & (1 << i) ? c : t.unknown}</b>
              </div>
            </li>
          ))}
        </ol>
        <div className="sp-case-tools">
          {t.drawerActions.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                onClose();
                window.dispatchEvent(new CustomEvent('sp-case-action', { detail: i }));
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
