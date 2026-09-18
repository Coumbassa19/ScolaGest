import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import UserAvatar from '@/components/global/UserAvatar';

export interface OutstandingBalanceEntry {
  id: string;
  name: string;
  amount: string;
  className: string;
  sexe: string;
  photoUrl: string | null;
}

export default async function PendingPayments({ entries }: { entries: OutstandingBalanceEntry[] }) {
  const t = await getTranslations('dashboard');
  return (
    <div className="bg-surface rounded-lg border border-border px-4 py-3 md:px-5 md:py-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-foreground">{t('pendingPayments')}</span>
        <Link href="/accounting/tuition" className="text-xs text-accent font-semibold">
          {t('viewAll')}
        </Link>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noOutstandingBalance')}</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3">
              <UserAvatar
                gender={e.sexe === 'F' ? 'female' : 'male'}
                heritage="African"
                index={e.id.charCodeAt(0)}
                src={e.photoUrl}
                className="w-8 h-8"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">{e.name}</div>
                <div className="text-xs text-muted-foreground truncate">{e.className}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-danger">{e.amount}</div>
                <Link href="/accounting/tuition" className="text-xs text-accent font-semibold">
                  {t('followUp')}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
