'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import Icon from '@/components/global/Icon';
import UserAvatar from '@/components/global/UserAvatar';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useAuth } from '@/contexts/AuthContext';

// Stable, locale-independent identifiers — every page passes these (not the
// translated label) as activeItem/activeSubmenu/expandedMenu so highlighting
// still works correctly no matter which language is active. `labelKey`
// resolves through next-intl's `sidebar` namespace (see src/i18n/messages).
interface NavSubItem {
  key: string;
  labelKey: string;
  href: string;
}

interface NavItem {
  key: string;
  icon: string;
  labelKey: string;
  href?: string;
  submenu?: NavSubItem[];
}

const navItems: NavItem[] = [
  { key: 'dashboard', icon: 'layout-dashboard', labelKey: 'dashboard', href: '/dashboard' },
  {
    key: 'students',
    icon: 'users',
    labelKey: 'studentsGroup',
    submenu: [
      { key: 'students-add', labelKey: 'studentsAdd', href: '/add-student' },
      { key: 'students-reregister', labelKey: 'studentsReregister', href: '/reregister-student' },
      { key: 'students-list', labelKey: 'studentsList', href: '/students' },
      { key: 'students-import', labelKey: 'studentsImport', href: '/students/import' },
      { key: 'students-classes', labelKey: 'studentsClasses', href: '/classes' },
      { key: 'students-cycles', labelKey: 'studentsCycles', href: '/cycles' },
      { key: 'students-cards', labelKey: 'studentsCards', href: '/student-cards' },
      {
        key: 'students-total-effectif',
        labelKey: 'studentsTotalEffectif',
        href: '/total-effectif',
      },
    ],
  },
  { key: 'teachers', icon: 'graduation-cap', labelKey: 'teachers', href: '/teachers' },
  { key: 'schedule', icon: 'calendar', labelKey: 'schedule', href: '/schedule' },
  { key: 'subjects', icon: 'book-open', labelKey: 'subjects', href: '/subjects' },
  { key: 'grades', icon: 'bar-chart-2', labelKey: 'grades', href: '/grades' },
  {
    key: 'accounting',
    icon: 'wallet',
    labelKey: 'accountingGroup',
    submenu: [
      {
        key: 'accounting-registration',
        labelKey: 'accountingRegistration',
        href: '/accounting/registration',
      },
      { key: 'accounting-tuition', labelKey: 'accountingTuition', href: '/accounting/tuition' },
      {
        key: 'accounting-teacher-payments',
        labelKey: 'accountingTeacherPayments',
        href: '/accounting/teacher-payments',
      },
      {
        key: 'accounting-staff-payments',
        labelKey: 'accountingStaffPayments',
        href: '/accounting/staff-payments',
      },
      {
        key: 'accounting-expenses',
        labelKey: 'accountingExpenses',
        href: '/accounting/expenses',
      },
      {
        key: 'accounting-salary-advances',
        labelKey: 'accountingSalaryAdvances',
        href: '/accounting/salary-advances',
      },
    ],
  },
  { key: 'absences', icon: 'user-x', labelKey: 'absences', href: '/absences' },
  {
    key: 'messages',
    icon: 'message-square',
    labelKey: 'messagesGroup',
    submenu: [
      { key: 'messages-new', labelKey: 'messagesNew', href: '/messages/new' },
      { key: 'messages-history', labelKey: 'messagesHistory', href: '/messages' },
    ],
  },
  { key: 'settings', icon: 'settings', labelKey: 'settings', href: '/settings' },
  // Platform-owner only (see the role check in visibleNavItems below) — not
  // a `menuKey` a school ADMIN/DIRECTION could ever be granted, since it
  // isn't a school-domain section at all.
  { key: 'platform', icon: 'building-2', labelKey: 'platform', href: '/admin/schools' },
];

export interface SidebarProps {
  /** Stable key from navItems — NOT the translated label. */
  activeItem?: string;
  activeSubmenu?: string | null;
  expandedMenu?: string | null;
}

export default function Sidebar({
  activeItem = 'dashboard',
  activeSubmenu = null,
  expandedMenu = null,
}: SidebarProps) {
  const t = useTranslations('sidebar');
  const [expanded, setExpanded] = React.useState(expandedMenu);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { user, logout } = useAuth();
  const displayName = user?.name?.trim() || user?.email || t('myAccount');
  // null menus (ADMIN/SUPERADMIN, or still loading) = unrestricted, matching
  // effectiveMenus()'s server-side contract. This is a UX convenience only —
  // requireStaff/requirePageAuth re-check the same thing on every request
  // regardless of what renders here.
  const visibleNavItems = (
    user?.menus === null || user?.menus === undefined
      ? navItems
      : navItems.filter((item) => user.menus!.includes(item.key))
  ).filter((item) => item.key !== 'platform' || user?.role === 'SUPERADMIN');

  async function handleLogout() {
    if (!window.confirm(t('confirmLogout'))) return;
    setMobileOpen(false);
    await logout();
    // Full navigation, not router.push: guarantees every client component
    // (Sidebar included) remounts with a clean logged-out state instead of
    // relying on every consumer reacting to the AuthContext update.
    window.location.assign('/login');
  }

  const navContent = (
    <>
      {/* Logo */}
      <div className="px-5 pt-6 pb-5 border-b border-sidebar-muted border-opacity-20">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-accent rounded-md flex items-center justify-center">
            <Icon i="graduation-cap" size={14} />
          </div>
          <div>
            <div className="text-sidebar-foreground font-headings font-semibold text-base leading-tight">
              ScolaGest
            </div>
            <div className="text-sidebar-muted text-xs">{t('tagline')}</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pt-4">
        <div className="text-sidebar-muted text-xs font-semibold uppercase tracking-wider px-2 mb-2">
          {t('navigation')}
        </div>
        <ul className="space-y-0.5">
          {visibleNavItems.map((item) => {
            const isActive = item.key === activeItem;
            const hasSubmenu = item.submenu && item.submenu.length > 0;
            const isExpanded = expanded === item.key;

            return (
              <li key={item.key}>
                {hasSubmenu ? (
                  <>
                    <button
                      onClick={() => setExpanded(isExpanded ? null : item.key)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-body justify-between ${
                        isActive ? 'bg-primary text-primary-foreground' : 'text-sidebar-muted'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon i={item.icon} size={15} />
                        <span>{t(item.labelKey)}</span>
                      </div>
                      <Icon i={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} />
                    </button>
                    {isExpanded && (
                      <ul className="mt-1 ml-3 space-y-0.5 border-l border-sidebar-muted border-opacity-30 pl-2">
                        {item.submenu?.map((subitem) => {
                          const isActiveSubmenu = subitem.key === activeSubmenu;
                          return (
                            <li key={subitem.key}>
                              <Link
                                href={subitem.href}
                                onClick={() => setMobileOpen(false)}
                                className={`block px-3 py-1.5 rounded-md text-xs font-body ${
                                  isActiveSubmenu
                                    ? 'bg-accent text-accent-foreground font-semibold'
                                    : 'text-sidebar-muted hover:text-sidebar-foreground'
                                }`}
                              >
                                {t(subitem.labelKey)}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                ) : (
                  <Link
                    href={item.href ?? '#'}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-body ${
                      isActive ? 'bg-primary text-primary-foreground' : 'text-sidebar-muted'
                    }`}
                  >
                    <Icon i={item.icon} size={15} />
                    <span>{t(item.labelKey)}</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User */}
      <div className="px-4 py-3 border-t border-sidebar-muted border-opacity-20">
        <div className="flex items-center gap-3 mb-3">
          <Link
            href="/profile"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 flex-1 min-w-0"
          >
            <UserAvatar
              src={user?.avatarUrl ?? null}
              gender="female"
              ageGroup="25-35"
              heritage="African"
              index={0}
              className="w-8 h-8"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sidebar-foreground text-sm font-semibold truncate">
                {displayName}
              </div>
              {user?.email && (
                <div className="text-sidebar-muted text-xs truncate">{user.email}</div>
              )}
            </div>
          </Link>
          <button
            type="button"
            onClick={() => void handleLogout()}
            aria-label={t('logout')}
            className="text-sidebar-muted flex-shrink-0"
          >
            <Icon i="log-out" size={14} />
          </button>
        </div>
        <LanguageSwitcher />
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar — shown below md, replaces the static sidebar */}
      <div className="flex md:hidden items-center justify-between px-4 py-3 bg-sidebar border-b border-sidebar-muted border-opacity-20">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-accent rounded-md flex items-center justify-center">
            <Icon i="graduation-cap" size={14} />
          </div>
          <div className="text-sidebar-foreground font-headings font-semibold text-base leading-tight">
            ScolaGest
          </div>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label={t('openMenu')}
          className="w-9 h-9 rounded-md flex items-center justify-center text-sidebar-foreground"
        >
          <Icon i="menu" size={20} />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          {/* Panel */}
          <div className="relative flex flex-col bg-sidebar w-64 max-w-[80vw] h-full overflow-y-auto">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label={t('closeMenu')}
              className="absolute top-4 right-3 w-8 h-8 rounded-md flex items-center justify-center text-sidebar-muted"
            >
              <Icon i="x" size={18} />
            </button>
            {navContent}
          </div>
        </div>
      )}

      {/* Desktop sidebar — sticky + its own scroll so the user/language
          footer stays reachable without scrolling to the bottom of long
          pages (it used to stretch to match the main column's height). */}
      <div className="hidden md:flex md:flex-col bg-sidebar w-56 h-screen sticky top-0 overflow-y-auto">
        {navContent}
      </div>
    </>
  );
}
