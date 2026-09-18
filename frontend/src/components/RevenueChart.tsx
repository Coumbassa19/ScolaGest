import { getTranslations } from 'next-intl/server';

export interface MonthDatum {
  label: string;
  value: number;
  max: number;
  current?: boolean;
}

// Fallback shown only if no real data is supplied — kept so this component
// still renders sensibly if reused outside the dashboard.
const DEFAULT_MONTHS: MonthDatum[] = [
  { label: 'Sep', value: 0, max: 1 },
  { label: 'Oct', value: 0, max: 1 },
  { label: 'Nov', value: 0, max: 1 },
  { label: 'Déc', value: 0, max: 1 },
  { label: 'Jan', value: 0, max: 1 },
  { label: 'Fév', value: 0, max: 1, current: true },
];

const fmt = (n: number) => (n / 1000000).toFixed(1) + 'M';

export default async function RevenueChart({ months = DEFAULT_MONTHS }: { months?: MonthDatum[] }) {
  const t = await getTranslations('dashboard');
  return (
    <div className="bg-surface rounded-lg border border-border px-4 py-3 md:px-5 md:py-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-foreground">{t('monthlyRevenue')}</span>
        <span className="text-xs text-muted-foreground">{t('lastSixMonths')}</span>
      </div>
      <div className="flex items-end gap-1.5 md:gap-3 h-32">
        {months.map((m) => {
          const pct = m.max > 0 ? Math.round((m.value / m.max) * 100) : 0;
          return (
            <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-muted-foreground">{fmt(m.value)}</span>
              <div className="w-full flex items-end" style={{ height: '80px' }}>
                <div
                  className={`w-full rounded-sm ${m.current ? 'bg-accent' : 'bg-primary'}`}
                  style={{ height: `${pct}%`, opacity: m.current ? 1 : 0.55 }}
                />
              </div>
              <span
                className={`text-xs font-semibold ${m.current ? 'text-accent' : 'text-muted-foreground'}`}
              >
                {m.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
