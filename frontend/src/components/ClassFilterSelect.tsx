'use client';

// Small real <select> that navigates via a `classId` query param — used by
// list pages (students, schedule) whose "Filtrer par classe" control used to
// be a decorative div. Keeps the same visual language (border, radius,
// padding) as the rest of the Banani design via `appearance-none` + a
// manually positioned chevron icon.
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Icon from '@/components/global/Icon';

export interface ClassFilterOption {
  id: string;
  name: string;
}

export default function ClassFilterSelect({
  classes,
  selected,
  basePath,
  allLabel,
}: {
  classes: ClassFilterOption[];
  selected: string;
  basePath: string;
  allLabel?: string;
}) {
  const router = useRouter();
  const t = useTranslations('common');

  return (
    <div className="relative">
      <select
        value={selected}
        onChange={(e) => {
          const value = e.target.value;
          router.push(value ? `${basePath}?classId=${value}` : basePath);
        }}
        className="w-full appearance-none border border-border rounded-md px-3 py-2 pr-8 bg-surface text-base text-foreground cursor-pointer"
      >
        <option value="">{allLabel ?? t('allClasses')}</option>
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
  );
}
