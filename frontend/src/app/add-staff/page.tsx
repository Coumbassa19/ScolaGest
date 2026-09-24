import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import StaffProfileForm from '@/components/forms/StaffProfileForm';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Ajouter un membre du personnel',
};

export default async function AddStaffPage() {
  // Enrolling a new HR record — same 'staff' menu gate as the rest of the
  // Personnel cluster (see /staff/page.tsx).
  await requirePageAuth({ menuKey: 'staff' });

  const t = await getTranslations('staff.add');
  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar activeItem="staff" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary">
          <Link
            href="/staff"
            className="flex items-center gap-2 text-muted-foreground text-sm font-semibold mb-4"
          >
            <Icon i="arrow-left" size={16} />
            {t('backLink')}
          </Link>
          <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
            {t('title')}
          </h1>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <StaffProfileForm />
        </div>
      </div>
    </div>
  );
}
