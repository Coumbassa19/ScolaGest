import { getTranslations } from 'next-intl/server';
import Icon from '@/components/global/Icon';

export interface ActivityEntry {
  label: string;
  amount: string;
  time: string;
  icon: string;
  positive: boolean | null;
}

export default async function RecentActivity({ entries = [] }: { entries?: ActivityEntry[] }) {
  const t = await getTranslations('dashboard');
  return (
    <div className="bg-surface rounded-lg border border-border px-4 py-3 md:px-5 md:py-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-foreground">{t('recentActivity')}</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">{t('noRecentActivity')}</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((e, i) => (
            <li key={i} className="flex items-center gap-3">
              <div
                className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${e.positive ? 'bg-success-bg text-success' : 'bg-muted text-muted-foreground'}`}
              >
                <Icon i={e.icon} size={13} />
              </div>
              <span className="flex-1 text-sm text-foreground">{e.label}</span>
              <div className="text-right">
                {e.amount && <span className="text-sm font-semibold text-success">{e.amount}</span>}
                <div className="text-xs text-muted-foreground">{e.time}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
