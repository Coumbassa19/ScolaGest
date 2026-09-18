'use client';

// "Imprimer" on /bulletin — triggers the browser's native print dialog.
// print:hidden classes elsewhere on the page hide the app chrome (header
// buttons, editable controls) so only the bulletin itself prints.
import { useTranslations } from 'next-intl';
import Icon from '@/components/global/Icon';

export default function PrintButton() {
  const t = useTranslations('bulletin');
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md"
    >
      <Icon i="printer" size={16} />
      {t('print')}
    </button>
  );
}
