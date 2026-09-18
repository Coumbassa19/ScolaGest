// GET /api/accounting/receipt/[paymentId]/pdf — "Télécharger le PDF" on the
//     /accounting/receipt/[paymentId] view: downloads that one payment's
//     receipt (inscription/réinscription/scolarité) as a single-page PDF.
//     Shares the same data loader (src/lib/server/receipt.ts) as the HTML
//     view so the two can never show different figures for the same
//     payment, and resolves every label through the current locale so the
//     PDF matches whichever language the HTML view was shown in. Gated to
//     the 'accounting' menu, same as the rest of this cluster — a receipt
//     PDF is financial data, not something to leave open to anyone with the
//     link.
//
// `runtime = 'nodejs'` is required by the runtime-enforcement test
// (frontend/src/lib/server/observability/runtime-enforcement.test.ts).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import QRCode from 'qrcode';
import { getTranslations, getLocale } from 'next-intl/server';
import { requireStaff } from '@/lib/server/middleware/require-staff';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { getReceiptData } from '@/lib/server/receipt';
import { amountInWords } from '@/lib/amount-in-words';
import { buildReceiptPdf, type ReceiptPdfOptions } from '@/lib/server/receipt-pdf';
import { requireSchoolId } from '@/lib/server/tenant/context';

function fmt(n: number, locale: string): string {
  // toLocaleString('fr-FR') separates thousands with a narrow no-break
  // space (U+202F) that pdfkit's built-in Helvetica (WinAnsi encoding)
  // can't render — it falls back to a stray "/" glyph. A plain space
  // renders fine and reads identically once printed.
  const formatted = n
    .toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR')
    .replace(/[\u202F\u00A0]/g, ' ');
  return `${formatted} GNF`;
}

function fmtDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireStaff({ menuKey: 'accounting' });
    if (auth instanceof NextResponse) return auth;

    const { paymentId } = await params;
    const receipt = await getReceiptData(
      auth.user.prisma,
      requireSchoolId(auth.user.schoolId),
      paymentId,
    );
    if (!receipt) {
      return NextResponse.json(
        { error: 'PAYMENT_NOT_FOUND', message: 'Reçu introuvable' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const [t, tc, locale] = await Promise.all([
      getTranslations('accounting.receipt'),
      getTranslations('accounting.common'),
      getLocale(),
    ]);

    const motifParts = [t(`categories.${receipt.categorie}` as never)];
    if (receipt.periode && ['T1', 'T2', 'T3', 'ANNUEL'].includes(receipt.periode)) {
      motifParts.push(t(`periods.${receipt.periode}` as never));
    }
    let motifText = motifParts.join(' — ');
    if (receipt.anneeScolaire) motifText += ` (${receipt.anneeScolaire})`;

    const qrBuffer = await QRCode.toBuffer(receipt.numeroRecu, { margin: 0, width: 200 });

    const options: ReceiptPdfOptions = {
      numeroRecu: receipt.numeroRecu,
      dateFormatted: fmtDate(receipt.date, locale),
      motifText,
      paymentMethodText: tc(`methods.${receipt.moyenPaiement}` as never),
      montantFormatted: fmt(receipt.montant, locale),
      amountWords: amountInWords(receipt.montant, locale),
      student: receipt.student,
      tuitionBalance: receipt.tuitionBalance
        ? {
            dueFormatted: receipt.tuitionBalance.due !== null ? fmt(receipt.tuitionBalance.due, locale) : '—',
            paidFormatted: fmt(receipt.tuitionBalance.paidTotal, locale),
            remainingFormatted:
              receipt.tuitionBalance.remaining !== null
                ? fmt(receipt.tuitionBalance.remaining, locale)
                : '—',
            settled: receipt.tuitionBalance.remaining === 0,
          }
        : null,
      school: receipt.school,
      qrBuffer,
      labels: {
        title: t('title'),
        subtitle: t('documentSubtitle'),
        receiptNumber: t('receiptNumberLabel'),
        date: t('dateLabel'),
        receivedFrom: t('receivedFromLabel'),
        student: t('studentLabel'),
        class: t('classLabel'),
        matricule: t('matriculeLabel'),
        guardian: t('guardianLabel'),
        phone: t('phoneLabel'),
        motif: t('motifLabel'),
        paymentMethod: t('paymentMethodLabel'),
        amount: t('amountLabel'),
        amountWordsIntro: t('amountWordsIntro'),
        balanceTitle: t('balanceTitle'),
        balanceDue: t('balanceDue'),
        balancePaid: t('balancePaid'),
        balanceRemaining: t('balanceRemaining'),
        balanceSettled: t('balanceSettled'),
        cashierSignature: t('cashierSignature'),
        schoolStamp: t('schoolStamp'),
        officialFooter: t('officialFooter'),
        generatedOn: t('generatedOn', { date: fmtDate(new Date(), locale) }),
      },
    };

    const buffer = await buildReceiptPdf(options);
    const filename = `recu-${receipt.numeroRecu}.pdf`.replace(/[^\w.-]+/g, '_');

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'x-request-id': ctx.requestId,
      },
    });
  });
}
