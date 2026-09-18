'use client';

// View tabs ("Tous" / "Par sexe" / "Moyenne") + class filter for
// /total-effectif. The tabs used to be decorative (no onClick — clicking did
// nothing); both controls now drive `vue`/`classId` query params together so
// switching one preserves the other, and the page (a Server Component)
// re-renders with the matching table.

import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Icon from '@/components/global/Icon';

export type EffectifView = 'tous' | 'sexe' | 'moyenne';

export interface EffectifClassOption {
  id: string;
  name: string;
}

export default function EffectifFilters({
  classes,
  activeView,
  activeClassId,
}: {
  classes: EffectifClassOption[];
  activeView: EffectifView;
  activeClassId: string;
}) {
  const t = useTranslations('totalEffectif');
  const VIEWS: { key: EffectifView; label: string }[] = [
    { key: 'tous', label: t('viewAll') },
    { key: 'sexe', label: t('viewBySex') },
    { key: 'moyenne', label: t('viewAverage') },
  ];
  const router = useRouter();
  const pathname = usePathname();

  function navigate(nextView: EffectifView, nextClassId: string) {
    const params = new URLSearchParams();
    if (nextView !== 'tous') params.set('vue', nextView);
    if (nextClassId) params.set('classId', nextClassId);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-2 border-b border-border overflow-x-auto">
        {VIEWS.map((v) => {
          const isActive = activeView === v.key;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => navigate(v.key, activeClassId)}
              className={`px-3 py-2.5 md:px-4 md:py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'text-primary border-primary'
                  : 'text-muted-foreground border-transparent'
              }`}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      <div className="relative w-full sm:w-64">
        <select
          value={activeClassId}
          onChange={(e) => navigate(activeView, e.target.value)}
          className="w-full appearance-none border border-border rounded-md px-3 py-2 pr-8 bg-surface text-sm text-foreground cursor-pointer"
        >
          <option value="">{t('allClasses')}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
          <Icon i="chevron-down" size={16} />
        </div>
      </div>
    </div>
  );
}
