import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import MessageComposer from '@/components/forms/MessageComposer';
import { getSchoolSettings } from '@/lib/server/school-settings';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';
import { requireSchoolId } from '@/lib/server/tenant/context';

export const metadata: Metadata = {
  title: 'Nouveau message',
};

export default async function NewMessagePage() {
  const staff = await requirePageAuth({ menuKey: 'messages' });
  const prisma = staff.user.prisma;
  const schoolId = requireSchoolId(staff.user.schoolId);
  const t = await getTranslations('messages.new');
  const [classes, teachers, school] = await Promise.all([
    prisma.schoolClass.findMany({ orderBy: [{ level: 'desc' }, { name: 'asc' }] }),
    prisma.teacher.findMany({ orderBy: [{ nom: 'asc' }, { prenom: 'asc' }] }),
    getSchoolSettings(prisma, schoolId),
  ]);

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar activeItem="messages" activeSubmenu="messages-new" expandedMenu="messages" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary">
          <Link
            href="/messages"
            className="flex items-center gap-2 text-muted-foreground text-sm font-semibold mb-4"
          >
            <Icon i="arrow-left" size={16} />
            {t('backLink')}
          </Link>
          <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <MessageComposer
            classes={classes.map((c) => ({ id: c.id, name: c.name }))}
            teachers={teachers.map((t) => ({
              id: t.id,
              nom: t.nom,
              prenom: t.prenom,
              email: t.email,
              telephone: t.telephone,
            }))}
            schoolName={school.name}
          />
        </div>
      </div>
    </div>
  );
}
