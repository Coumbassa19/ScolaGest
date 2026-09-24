import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import CreateUserForm from '@/components/forms/CreateUserForm';
import { requireSchoolAdminPage } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Créer un utilisateur',
};

export default async function NewStaffUserPage() {
  // Role gate, not a menu gate — see requireSchoolAdminPage /
  // settings/page.tsx's isAdmin check for why managing other accounts is
  // never something enabledMenus can grant. ADMIN/SUPERADMIN or a
  // DIRECTION account managing its own school.
  const admin = await requireSchoolAdminPage();
  const prisma = admin.user.prisma;

  const [unlinkedTeachers, unlinkedStaff] = await Promise.all([
    prisma.teacher.findMany({
      where: { user: null },
      select: { id: true, nom: true, prenom: true },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    }),
    prisma.staff.findMany({
      where: { user: null },
      select: { id: true, nom: true, prenom: true, poste: true },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    }),
  ]);

  const t = await getTranslations('settings.users.new');

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
          <CreateUserForm
            canCreateAdmins={admin.user.role === 'SUPERADMIN'}
            unlinkedTeachers={unlinkedTeachers}
            unlinkedStaff={unlinkedStaff}
          />
        </div>
      </div>
    </div>
  );
}
