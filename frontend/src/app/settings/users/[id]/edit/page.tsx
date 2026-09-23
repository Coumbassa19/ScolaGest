import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import EditUserMenusForm from '@/components/forms/EditUserMenusForm';
import { requireAdminPage } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Modifier les accès',
};

export default async function EditUserMenusPage({ params }: { params: Promise<{ id: string }> }) {
  // Role gate, not a menu gate — same reasoning as /settings/users/new
  // (see requireAdminPage): managing another account's access is never
  // something enabledMenus itself can grant.
  const admin = await requireAdminPage('ADMIN');
  const prisma = admin.user.prisma;
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, enabledMenus: true },
  });
  if (!user || (user.role !== 'DIRECTION' && user.role !== 'TEACHER' && user.role !== 'STAFF')) {
    notFound();
  }

  const t = await getTranslations('settings.users.edit');

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar activeItem="settings" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary">
          <Link
            href="/settings"
            className="flex items-center gap-2 text-muted-foreground text-sm font-semibold mb-4"
          >
            <Icon i="arrow-left" size={16} />
            {t('backLink')}
          </Link>
          <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
            {t('pageTitle')}
          </h1>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <EditUserMenusForm
            userId={user.id}
            email={user.email}
            name={user.name}
            role={user.role as 'DIRECTION' | 'TEACHER' | 'STAFF'}
            initialEnabledMenus={
              Array.isArray(user.enabledMenus) ? (user.enabledMenus as string[]) : []
            }
          />
        </div>
      </div>
    </div>
  );
}
