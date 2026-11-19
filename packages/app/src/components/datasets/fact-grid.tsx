import { Stat } from '@/components/ui/stat';

/**
 * Headline numbers under an AgentX article title. Cells draw their own top/left hairlines and the
 * frame clips the outer ones, so a short last row leaves blank card instead of a filled gap.
 */
export function FactGrid({ items }: { items: readonly { label: string; value: string }[] }) {
  return (
    <div className="mt-8 overflow-hidden rounded-xl border border-border/30 bg-card">
      <dl
        className={`-mt-px -ml-px grid grid-cols-2 ${items.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}
      >
        {items.map((item) => (
          <Stat
            key={item.label}
            valueFirst
            label={item.label}
            value={item.value}
            valueClassName="text-xl"
            className="border-t border-l border-border/30 px-4 py-5"
          />
        ))}
      </dl>
    </div>
  );
}
