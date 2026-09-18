import type { Metadata } from 'next';
import Link from 'next/link';
import QRCode from 'qrcode';
import { getTranslations, getLocale } from 'next-intl/server';
import Icon from '@/components/global/Icon';
import PrintButton from '@/components/PrintButton';
import { getReceiptData } from '@/lib/server/receipt';
import { amountInWords } from '@/lib/amount-in-words';
import { computeInitials } from '@/lib/bulletin-format';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';
import { requireSchoolId } from '@/lib/server/tenant/context';

export const metadata: Metadata = {
  title: 'Reçu de paiement',
};

function fmt(n: number, locale: string): string {
  return n.toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR');
}

function fmtDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const CATEGORY_BACK_HREF: Record<string, string> = {
  INSCRIPTION: '/accounting/registration',
  REINSCRIPTION: '/accounting/registration',
  SCOLARITE: '/accounting/tuition',
};

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const staff = await requirePageAuth({ menuKey: 'accounting' });

  const { paymentId } = await params;
  const t = await getTranslations('accounting.receipt');
  const tc = await getTranslations('accounting.common');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();

  const receipt = await getReceiptData(
    staff.user.prisma,
    requireSchoolId(staff.user.schoolId),
    paymentId,
  );

  if (!receipt) {
    return (
      <div className="bg-background min-h-full font-body flex items-center justify-center px-4 py-10">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-headings font-semibold text-foreground">
            {t('notFoundTitle')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('notFoundBody')}</p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md"
          >
            <Icon i="arrow-left" size={16} />
            {tCommon('backToDashboard')}
          </Link>
        </div>
      </div>
    );
  }

  const { school, student, tuitionBalance } = receipt;
  const backHref = CATEGORY_BACK_HREF[receipt.categorie] ?? '/dashboard';
  const qrDataUrl = await QRCode.toDataURL(receipt.numeroRecu, { margin: 0, width: 200 });

  return (
    <div className="bg-background min-h-full font-body">
      {/* Header with controls */}
      <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary sticky top-0 z-10 flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-headings font-semibold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {receipt.numeroRecu} — {student ? `${student.nom} ${student.prenom}` : '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <PrintButton />
          <a
            href={`/api/accounting/receipt/${paymentId}/pdf`}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md"
          >
            <Icon i="download" size={16} />
            {t('download')}
          </a>
          <Link
            href={backHref}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-foreground border border-border rounded-md"
          >
            <Icon i="arrow-left" size={16} />
            {t('back')}
          </Link>
        </div>
      </div>

      {/* Receipt content */}
      <div className="max-w-2xl mx-auto px-4 py-6 md:px-8 md:py-8">
        <div className="bg-white border-2 border-border rounded-lg shadow-sm">
          {/* School Header */}
          <div className="px-4 py-6 md:px-8 border-b-2 border-border text-center">
            <div className="mb-4 flex justify-center">
              {school.logoUrl ? (
                <img
                  src={school.logoUrl}
                  alt={`Logo ${school.name}`}
                  className="w-16 h-16 rounded-full object-cover border border-border"
                />
              ) : (
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-primary-foreground font-headings font-bold text-lg">
                    {computeInitials(school.name)}
                  </span>
                </div>
              )}
            </div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {school.republiqueName}
            </p>
            <p className="text-[11px] text-muted-foreground italic mb-2">{school.devise}</p>
            <h1 className="text-xl font-headings font-semibold text-foreground">{school.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">{school.address}</p>
            <p className="text-sm text-muted-foreground">
              {school.phone} | {school.email}
            </p>
          </div>

          {/* Title bar: receipt number + date */}
          <div className="px-4 py-4 md:px-8 border-b border-border bg-muted flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">
                {t('receiptNumberLabel')}
              </p>
              <p className="text-lg font-headings font-bold text-primary">{receipt.numeroRecu}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-muted-foreground uppercase">
                {t('dateLabel')}
              </p>
              <p className="text-sm font-semibold text-foreground">
                {fmtDate(receipt.date, locale)}
              </p>
            </div>
          </div>

          <div className="px-4 py-2 md:px-8 text-center">
            <p className="text-xs text-muted-foreground italic">{t('documentSubtitle')}</p>
          </div>

          {/* Received from */}
          <div className="px-4 py-6 md:px-8 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">
              {t('receivedFromLabel')}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  {t('studentLabel')}
                </p>
                <p className="font-semibold text-foreground mt-1">
                  {student ? `${student.nom} ${student.prenom}` : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  {t('classLabel')}
                </p>
                <p className="font-semibold text-foreground mt-1">{student?.className ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  {t('matriculeLabel')}
                </p>
                <p className="font-semibold text-foreground mt-1">{student?.matricule ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  {t('guardianLabel')}
                </p>
                <p className="font-semibold text-foreground mt-1">
                  {student?.parentNom ?? '—'}
                  {student?.parentTelephone && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {t('phoneLabel')}: {student.parentTelephone}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Payment details */}
          <div className="px-4 py-6 md:px-8 border-b border-border space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase">
                {t('motifLabel')}
              </span>
              <span className="text-sm font-semibold text-foreground">
                {t(`categories.${receipt.categorie}` as never)}
                {receipt.periode &&
                  ['T1', 'T2', 'T3', 'ANNUEL'].includes(receipt.periode) &&
                  ` — ${t(`periods.${receipt.periode}` as never)}`}
                {receipt.anneeScolaire && ` (${receipt.anneeScolaire})`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase">
                {t('paymentMethodLabel')}
              </span>
              <span className="text-sm font-semibold text-foreground">
                {tc(`methods.${receipt.moyenPaiement}` as never)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-sm font-semibold text-foreground uppercase">
                {t('amountLabel')}
              </span>
              <span className="text-2xl font-headings font-bold text-success">
                {fmt(receipt.montant, locale)} GNF
              </span>
            </div>
            <div className="border-2 border-dashed border-border rounded-md px-4 py-3 bg-muted">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                {t('amountWordsIntro')}
              </p>
              <p className="text-sm font-semibold text-foreground italic capitalize">
                {amountInWords(receipt.montant, locale)}
              </p>
            </div>
          </div>

          {/* Tuition balance snapshot */}
          {tuitionBalance && (
            <div className="px-4 py-6 md:px-8 border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">
                {t('balanceTitle')}
              </p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">{t('balanceDue')}</p>
                  <p className="font-semibold text-foreground mt-1">
                    {tuitionBalance.due !== null ? `${fmt(tuitionBalance.due, locale)} GNF` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('balancePaid')}</p>
                  <p className="font-semibold text-success mt-1">
                    {fmt(tuitionBalance.paidTotal, locale)} GNF
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('balanceRemaining')}</p>
                  <p
                    className={`font-semibold mt-1 ${tuitionBalance.remaining && tuitionBalance.remaining > 0 ? 'text-warning' : 'text-foreground'}`}
                  >
                    {tuitionBalance.remaining !== null
                      ? `${fmt(tuitionBalance.remaining, locale)} GNF`
                      : '—'}
                  </p>
                </div>
              </div>
              {tuitionBalance.remaining === 0 && (
                <p className="text-xs font-semibold text-success mt-3">{t('balanceSettled')}</p>
              )}
            </div>
          )}

          {/* Signatures + QR */}
          <div className="px-4 py-8 md:px-8 flex items-end justify-between gap-4">
            <img src={qrDataUrl} alt={receipt.numeroRecu} className="w-16 h-16" />
            <div className="flex gap-10">
              <div className="w-36 text-center">
                <div className="border-t-2 border-foreground h-16 mb-2"></div>
                <p className="text-xs font-semibold text-foreground uppercase">
                  {t('cashierSignature')}
                </p>
              </div>
              <div className="w-36 text-center">
                <div className="border-t-2 border-foreground h-16 mb-2"></div>
                <p className="text-xs font-semibold text-foreground uppercase">
                  {t('schoolStamp')}
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-4 md:px-8 border-t-2 border-border text-center bg-muted rounded-b-md">
            <p className="text-xs text-muted-foreground">{t('officialFooter')}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('generatedOn', { date: fmtDate(new Date(), locale) })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
