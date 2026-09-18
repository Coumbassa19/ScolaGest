// Stacked-card presentation of a data table's rows for narrow screens.
// Every data table in the app is a CSS-grid table wrapped in
// `overflow-x-auto` with a `min-w-[Npx]` inner div — functional, but on a
// phone it means swiping sideways to reach columns like "Statut" or a
// row's Modifier/Supprimer actions, with no visual hint that more content
// exists off-screen. Pages pair this component (rendered `sm:hidden`) with
// their existing grid table (wrapped `hidden sm:block`) so touch users get
// a readable, fully-visible card per row instead.
import type { ReactNode } from 'react';

export function MobileCardList<T>({
  items,
  keyFor,
  renderCard,
  emptyMessage,
}: {
  items: T[];
  keyFor: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  emptyMessage: ReactNode;
}) {
  if (items.length === 0) {
    return <div className="px-4 py-6 text-sm text-muted-foreground text-center">{emptyMessage}</div>;
  }
  return (
    <div className="divide-y divide-border">
      {items.map((item) => (
        <div key={keyFor(item)} className="px-4 py-4 space-y-1.5">
          {renderCard(item)}
        </div>
      ))}
    </div>
  );
}

/** One label/value line inside a card — mirrors a single table cell. */
export function CardField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-foreground text-right min-w-0">{value}</span>
    </div>
  );
}
