// Paramètres — ScolaGest school-settings screen (Banani design) merged with the
// starter's existing real, backend-wired account-security controls.
//
// The starter shipped this route as a functional account page (password
// change + Google OAuth linking, calling the real /api/auth/* endpoints —
// see AuthContext/ToastContext, now in components/settings/AccountSecuritySection).
// The Banani design export also targets `/settings` for school-level
// configuration (institution info, academic calendar, users, preferences,
// data). Rather than deleting the working account-security flows, both live
// here: the Banani sections render first, followed by a "Compte" section
// that keeps the original password/OAuth functionality, restyled to match
// the new design tokens.
//
// An async Server Component (not 'use client') so "Informations de
// l'établissement" can fetch its data server-side, like every other form in
// this app — the interactive bits that need it are their own client
// components (AccountSecuritySection, AcademicYearControl, SchoolSettingsForm).
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import AcademicYearControl from '@/components/forms/AcademicYearControl';
import AccountSecuritySection from '@/components/settings/AccountSecuritySection';
import GradingWeightsForm from '@/components/forms/GradingWeightsForm';
import SchoolSettingsForm from '@/components/forms/SchoolSettingsForm';
import UserStatusToggle from '@/components/settings/UserStatusToggle';
import { getSchoolSettings } from '@/lib/server/school-settings';
import { MobileCardList, CardField } from '@/components/MobileCardList';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';
import { requireSchoolId } from '@/lib/server/tenant/context';

const STAFF_ROLE_KEY: Record<string, string> = {
  ADMIN: 'roleAdmin',
  SUPERADMIN: 'roleSuperadmin',
  DIRECTION: 'roleDirection',
  TEACHER: 'roleTeacher',
  STAFF: 'roleStaff',
};

export default async function SettingsPage() {
  const staff = await requirePageAuth({ menuKey: 'settings' });
  const prisma = staff.user.prisma;
  const schoolId = requireSchoolId(staff.user.schoolId);
  // Managing OTHER accounts' access is a role privilege, not a menu toggle
  // (see requireSchoolAdminPage) — TEACHER/STAFF accounts with the
  // 'settings' menu granted still never see this section, no matter what
  // enabledMenus says. DIRECTION is included here (unlike roleRank, which
  // ranks it 0 for the platform-wide /admin back office): a school's own
  // owner manages its own school's accounts, just never another school's.
  const isAdmin =
    staff.user.role === 'ADMIN' ||
    staff.user.role === 'SUPERADMIN' ||
    staff.user.role === 'DIRECTION';
  const staffUsers = isAdmin
    ? await prisma.user.findMany({
        where: { schoolId, role: { in: ['ADMIN', 'SUPERADMIN', 'DIRECTION', 'TEACHER', 'STAFF'] } },
        select: { id: true, email: true, name: true, role: true, status: true },
        orderBy: { createdAt: 'desc' },
      })
    : [];
  const schoolSettings = await getSchoolSettings(prisma, schoolId);
  const t = await getTranslations('settings');
  const tc = await getTranslations('common');
  const tb = await getTranslations('billing');
  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar activeItem="settings" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-muted-foreground text-sm font-semibold mb-4"
          >
            <Icon i="arrow-left" size={16} />
            {tc('backToDashboard')}
          </Link>
          <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
            {t('title')}
          </h1>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <div className="max-w-4xl space-y-6">
            {/* Subscription status — proactive link so a school can check
                before it's ever blocked, not just once the gate forces it here. */}
            <Link
              href="/billing"
              className="flex items-center justify-between bg-surface rounded-lg border border-border px-6 py-4"
            >
              <div className="flex items-center gap-3">
                <Icon i="circle-dollar-sign" size={18} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">{tb('title')}</span>
              </div>
              <Icon i="chevron-right" size={16} className="text-muted-foreground" />
            </Link>

            {/* Section: Informations de l'établissement */}
            <SchoolSettingsForm initialData={schoolSettings} />

            {/* Section: Pondération des notes (devoirs vs composition) */}
            <GradingWeightsForm
              initialData={{
                coefDevoir: schoolSettings.coefDevoir,
                coefComposition: schoolSettings.coefComposition,
              }}
            />

            {/* Section: Calendrier académique */}
            <div className="bg-surface rounded-lg border border-border px-6 py-5">
              <div className="mb-5 pb-5 border-b border-border">
                <h2 className="text-lg font-headings font-semibold text-foreground">
                  {t('calendar.title')}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">{t('calendar.subtitle')}</p>
              </div>

              <AcademicYearControl />
            </div>

            {/* Section: Utilisateurs — ADMIN/SUPERADMIN/DIRECTION only (see isAdmin above) */}
            {isAdmin && (
              <div className="bg-surface rounded-lg border border-border px-6 py-5">
                <div className="mb-5 pb-5 border-b border-border flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-headings font-semibold text-foreground">
                      {t('users.title')}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">{t('users.subtitle')}</p>
                  </div>
                  <Link
                    href="/settings/users/new"
                    className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md"
                  >
                    {t('users.addUser')}
                  </Link>
                </div>

                {/* Mobile: stacked cards (below sm) */}
                <div className="sm:hidden -mx-2">
                  <MobileCardList
                    items={staffUsers}
                    keyFor={(u) => u.id}
                    emptyMessage={t('users.noneYet')}
                    renderCard={(u) => (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-foreground text-sm break-all">
                            {u.name ? `${u.name} — ${u.email}` : u.email}
                          </span>
                          <span
                            className={`text-xs font-semibold px-2 py-1 rounded-md w-fit shrink-0 ${u.status === 'ACTIVE' ? 'bg-success text-background' : 'bg-muted text-muted-foreground'}`}
                          >
                            {u.status === 'ACTIVE' ? t('users.active') : t('users.suspended')}
                          </span>
                        </div>
                        <CardField
                          label={t('users.role')}
                          value={t(`users.${STAFF_ROLE_KEY[u.role] ?? 'roleTeacher'}`)}
                        />
                        <div className="pt-1.5 flex justify-end gap-4">
                          {(u.role === 'DIRECTION' ||
                            u.role === 'TEACHER' ||
                            u.role === 'STAFF') && (
                            <Link
                              href={`/settings/users/${u.id}/edit`}
                              className="text-sm font-semibold text-primary"
                            >
                              {t('users.editMenus')}
                            </Link>
                          )}
                          <UserStatusToggle userId={u.id} status={u.status} />
                        </div>
                      </>
                    )}
                  />
                </div>

                {/* Desktop: grid table (sm and up) */}
                <div className="hidden sm:block space-y-2 overflow-x-auto">
                  <div style={{ minWidth: '520px' }}>
                    <div className="grid grid-cols-5 gap-3 px-4 py-3 bg-muted rounded-md">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('users.email')}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('users.role')}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t('users.status')}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider col-span-2">
                        {t('users.actions')}
                      </span>
                    </div>

                    {staffUsers.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                        {t('users.noneYet')}
                      </div>
                    ) : (
                      staffUsers.map((u) => (
                        <div
                          key={u.id}
                          className="grid grid-cols-5 gap-3 px-4 py-3 border-b border-border items-center"
                        >
                          <span className="text-sm text-foreground break-all">
                            {u.name ? `${u.name} — ${u.email}` : u.email}
                          </span>
                          <span className="text-sm font-semibold text-foreground">
                            {t(`users.${STAFF_ROLE_KEY[u.role] ?? 'roleTeacher'}`)}
                          </span>
                          <div
                            className={`text-xs font-semibold px-2 py-1 rounded-md w-fit ${u.status === 'ACTIVE' ? 'bg-success text-background' : 'bg-muted text-muted-foreground'}`}
                          >
                            {u.status === 'ACTIVE' ? t('users.active') : t('users.suspended')}
                          </div>
                          <div className="flex items-center gap-4">
                            {(u.role === 'DIRECTION' ||
                              u.role === 'TEACHER' ||
                              u.role === 'STAFF') && (
                              <Link
                                href={`/settings/users/${u.id}/edit`}
                                className="text-sm font-semibold text-primary"
                              >
                                {t('users.editMenus')}
                              </Link>
                            )}
                            <UserStatusToggle userId={u.id} status={u.status} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Section: Préférences */}
            <div className="bg-surface rounded-lg border border-border px-6 py-5">
              <div className="mb-5 pb-5 border-b border-border">
                <h2 className="text-lg font-headings font-semibold text-foreground">
                  {t('preferences.title')}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">{t('preferences.subtitle')}</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-semibold text-foreground">
                      {t('preferences.languageLabel')}
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('preferences.languageHint')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div>
                    <label className="text-sm font-semibold text-foreground">
                      {t('preferences.dateFormatLabel')}
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('preferences.dateFormatFixed')}
                    </p>
                  </div>
                  <div className="border border-border rounded-md px-3 py-2 bg-muted min-w-32 text-center">
                    <span className="text-sm text-foreground">
                      {t('preferences.dateFormatSample')}
                    </span>
                  </div>
                </div>

                {/* Notifications on/off — masqué pour l'instant, même raison que la
                    section Données : jamais branché à un vrai backend, et il faut
                    d'abord décider quels emails précisément ce réglage doit couvrir
                    avant de le construire pour de vrai. */}
              </div>
            </div>

            {/* Section: Données — masquée pour l'instant (sauvegarde/restauration/
                suppression n'ont jamais été branchées à un vrai backend ; décision
                explicite de l'utilisateur de reporter cette fonctionnalité à un
                chantier dédié plutôt que d'exposer des boutons inertes ou une
                version bâclée). Ré-activer + construire le backend quand demandé. */}

            {/* Section: Compte (real, backend-wired — preserved from the starter) */}
            <AccountSecuritySection />
          </div>
        </div>
      </div>
    </div>
  );
}
