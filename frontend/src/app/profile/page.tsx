import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import ProfileAccountCard from '@/components/forms/ProfileAccountCard';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Mon Profil',
};

export default async function ProfilePage() {
  // No specific menuKey — "my own profile" isn't tied to one of the 10
  // school-domain menus, it's just "any authenticated staff account" (same
  // shared-infrastructure pattern as the plain requireStaff() calls in
  // GET /api/students, /api/subjects, etc). It still queries school-wide
  // revenue/enrollment counts below, so it needs *a* gate, just not a
  // menu-specific one.
  const staff = await requirePageAuth();
  const prisma = staff.user.prisma;

  const t = await getTranslations('profile');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalStudents, totalTeachers, totalClasses, monthPayments] = await Promise.all([
    prisma.student.count(),
    prisma.teacher.count(),
    prisma.schoolClass.count(),
    prisma.revenuePayment.findMany({
      where: { date: { gte: startOfMonth } },
      select: { montant: true },
    }),
  ]);
  const revenusCeMois = monthPayments.reduce((sum, p) => sum + p.montant, 0);

  const accountStats = [
    { label: t('statStudents'), value: String(totalStudents) },
    { label: t('statTeachers'), value: String(totalTeachers) },
    { label: t('statClasses'), value: String(totalClasses) },
    {
      label: t('statRevenueThisMonth'),
      value: `${revenusCeMois.toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR')} GNF`,
    },
  ];

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar activeItem="profile" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-muted-foreground text-sm font-semibold mb-4"
          >
            <Icon i="arrow-left" size={16} />
            {tCommon('backToDashboard')}
          </Link>
          <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
            {t('title')}
          </h1>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6 overflow-y-auto">
          <div className="max-w-4xl space-y-6">
            {/* Account identity — real data, editable (name, phone, photo) */}
            <ProfileAccountCard />

            {/* Stats — real counts from the database */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {accountStats.map((stat) => (
                <div
                  key={stat.label}
                  className="bg-surface rounded-lg border border-border px-4 py-4 text-center"
                >
                  <p className="text-2xl font-headings font-semibold text-primary">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Security & Access */}
            <div className="bg-surface rounded-lg border border-border px-6 py-5 max-w-xl">
              <div className="mb-5 pb-5 border-b border-border">
                <h3 className="text-lg font-headings font-semibold text-foreground">
                  {t('securityTitle')}
                </h3>
              </div>
              <div className="space-y-3">
                <Link
                  href="/settings"
                  className="w-full flex items-center justify-between px-3 py-2 border border-border rounded-md bg-surface hover:text-primary text-left text-sm font-semibold text-foreground"
                >
                  <span>{t('changePassword')}</span>
                  <Icon i="arrow-right" size={16} />
                </Link>
                <div className="w-full flex items-center justify-between px-3 py-2 border border-border rounded-md bg-input text-left text-sm font-semibold text-muted-foreground">
                  <span>{t('twoFactor')}</span>
                  <span className="text-xs">{t('comingSoon')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
