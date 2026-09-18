import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import type { MessageTemplateType } from '@/lib/message-templates';
import { MobileCardList, CardField } from '@/components/MobileCardList';
import MessageRowActions from '@/components/messages/MessageRowActions';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Historique des messages',
};

const STATUS_CLASS: Record<string, string> = {
  SENT: 'text-success bg-success/10',
  PENDING: 'text-warning bg-warning/10',
  FAILED: 'text-danger bg-danger/10',
  UNAVAILABLE: 'text-muted-foreground bg-muted',
  SKIPPED: 'text-muted-foreground bg-muted',
};

// Tabs group the 5 raw statuses into the 3 outcomes the admin actually
// thinks in terms of (+ "all"). FAILED/UNAVAILABLE/SKIPPED are all "the
// recipient did not get this" from the admin's point of view — the exact
// reason still shows per-row via the status badge + errorReason caption.
type StatusTab = 'ALL' | 'SENT' | 'PENDING' | 'FAILED';
const TAB_STATUSES: Record<StatusTab, string[] | null> = {
  ALL: null,
  SENT: ['SENT'],
  PENDING: ['PENDING'],
  FAILED: ['FAILED', 'UNAVAILABLE', 'SKIPPED'],
};

function fmtDateTime(d: Date, locale: string): string {
  return d.toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function MessagesHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const staff = await requirePageAuth({ menuKey: 'messages' });
  const prisma = staff.user.prisma;
  const t = await getTranslations('messages.history');
  const tm = await getTranslations('messages');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();
  const sp = await searchParams;
  const activeTab: StatusTab =
    sp.status && sp.status in TAB_STATUSES ? (sp.status as StatusTab) : 'ALL';

  const allMessages = await prisma.schoolMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: { student: { include: { schoolClass: true } }, teacher: true },
  });

  const counts: Record<StatusTab, number> = {
    ALL: allMessages.length,
    SENT: allMessages.filter((m) => TAB_STATUSES.SENT!.includes(m.status)).length,
    PENDING: allMessages.filter((m) => TAB_STATUSES.PENDING!.includes(m.status)).length,
    FAILED: allMessages.filter((m) => TAB_STATUSES.FAILED!.includes(m.status)).length,
  };

  const activeStatuses = TAB_STATUSES[activeTab];
  const messages = activeStatuses
    ? allMessages.filter((m) => activeStatuses.includes(m.status))
    : allMessages;

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar activeItem="messages" activeSubmenu="messages-history" expandedMenu="messages" />

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
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
                {t('title')}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
            </div>
            <Link
              href="/messages/new"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md"
            >
              <Icon i="plus" size={16} />
              {t('newMessage')}
            </Link>
          </div>
        </div>

        {/* Status tabs */}
        <div className="px-4 pt-3 md:px-8 border-b border-border bg-secondary flex flex-wrap gap-2">
          {(
            [
              ['ALL', t('tabAll')],
              ['SENT', t('tabSent')],
              ['PENDING', t('tabPending')],
              ['FAILED', t('tabFailed')],
            ] as [StatusTab, string][]
          ).map(([value, label]) => (
            <Link
              key={value}
              href={value === 'ALL' ? '/messages' : `/messages?status=${value}`}
              className={`px-3 py-1.5 rounded-t-md text-sm font-semibold border-b-2 -mb-px ${
                activeTab === value
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {label} <span className="text-xs font-normal">({counts[value]})</span>
            </Link>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          {messages.length === 0 ? (
            <div className="bg-surface rounded-lg border border-border px-5 py-10 text-center text-sm text-muted-foreground">
              {activeTab === 'ALL' ? (
                <>
                  {t('noMessages')}{' '}
                  <Link href="/messages/new" className="text-primary font-semibold">
                    {t('sendFirst')}
                  </Link>
                </>
              ) : (
                t('noMessagesForTab')
              )}
            </div>
          ) : (
            <div className="bg-surface rounded-lg border border-border overflow-hidden">
              {/* Mobile: stacked cards (below sm) */}
              <div className="sm:hidden">
                <MobileCardList
                  items={messages}
                  keyFor={(m) => m.id}
                  emptyMessage={t('noMessages')}
                  renderCard={(m) => (
                    <>
                      <div>
                        <div className="font-semibold text-foreground text-sm">
                          {m.recipientType === 'TEACHER'
                            ? `${m.teacher?.nom ?? '?'} ${m.teacher?.prenom ?? ''}`
                            : `${m.student?.nom ?? '?'} ${m.student?.prenom ?? ''}`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {m.recipientType === 'TEACHER'
                            ? t('teacherLabel')
                            : (m.student?.schoolClass.name ?? '')}{' '}
                          · {m.recipient || '—'}
                        </div>
                      </div>
                      <CardField label={t('headerDate')} value={fmtDateTime(m.createdAt, locale)} />
                      <CardField
                        label={t('headerChannel')}
                        value={m.channel === 'EMAIL' ? tm('channelEmail') : tm('channelSms')}
                      />
                      <CardField
                        label={t('headerTemplate')}
                        value={tm(`templates.${m.templateType as MessageTemplateType}`)}
                      />
                      <div className="flex items-start justify-between gap-3 text-sm">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">
                          {t('headerStatus')}
                        </span>
                        <div className="flex flex-col items-end gap-1 max-w-[70%]">
                          <span
                            className={`text-xs font-semibold w-fit px-2 py-1 rounded-md ${
                              STATUS_CLASS[m.status] ?? 'text-muted-foreground bg-muted'
                            }`}
                          >
                            {tm(`status.${m.status}`)}
                          </span>
                          {m.errorReason && (
                            <p className="text-xs text-muted-foreground text-right">
                              {m.errorReason}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="pt-1.5 flex justify-end">
                        <MessageRowActions id={m.id} status={m.status} />
                      </div>
                    </>
                  )}
                />
              </div>

              {/* Desktop: grid table (sm and up) */}
              <div className="hidden sm:block overflow-x-auto">
                <div className="min-w-[920px]">
                  <div className="grid grid-cols-8 gap-4 px-5 py-3 bg-muted border-b border-border">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider col-span-2">
                      {t('headerDate')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider col-span-2">
                      {t('headerRecipient')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerChannel')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerTemplate')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('headerStatus')}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">
                      {t('headerActions')}
                    </span>
                  </div>
                  <div>
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className="grid grid-cols-8 gap-4 px-5 py-3 border-b border-border hover:bg-input items-center"
                      >
                        <span className="text-sm text-muted-foreground col-span-2">
                          {fmtDateTime(m.createdAt, locale)}
                        </span>
                        <div className="col-span-2 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {m.recipientType === 'TEACHER'
                              ? `${m.teacher?.nom ?? '?'} ${m.teacher?.prenom ?? ''}`
                              : `${m.student?.nom ?? '?'} ${m.student?.prenom ?? ''}`}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {m.recipientType === 'TEACHER'
                              ? t('teacherLabel')
                              : (m.student?.schoolClass.name ?? '')}{' '}
                            · {m.recipient || '—'}
                          </p>
                        </div>
                        <span className="text-sm text-foreground">
                          {m.channel === 'EMAIL' ? tm('channelEmail') : tm('channelSms')}
                        </span>
                        <span className="text-sm text-foreground">
                          {tm(`templates.${m.templateType as MessageTemplateType}`)}
                        </span>
                        <div className="min-w-0">
                          <span
                            className={`text-xs font-semibold w-fit px-2 py-1 rounded-md inline-block ${
                              STATUS_CLASS[m.status] ?? 'text-muted-foreground bg-muted'
                            }`}
                          >
                            {tm(`status.${m.status}`)}
                          </span>
                          {m.errorReason && (
                            <p className="text-xs text-muted-foreground truncate" title={m.errorReason}>
                              {m.errorReason}
                            </p>
                          )}
                        </div>
                        <div className="flex justify-end">
                          <MessageRowActions id={m.id} status={m.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
