// Renders a payment receipt (inscription/réinscription/frais de scolarité)
// as a single-page PDF — the downloadable counterpart to the printable HTML
// view at /accounting/receipt/[paymentId]. Unlike bulletin-pdf.ts (French
// only), every label here is passed in already resolved by the caller
// (src/app/api/accounting/receipt/[paymentId]/pdf/route.ts) via
// getTranslations, so the same builder renders correctly in either app
// locale instead of hardcoding French.
import 'server-only';
import PDFDocument from 'pdfkit';
import { computeInitials } from '@/lib/bulletin-format';
import { drawCoverImage } from '@/lib/server/pdf-image';

export interface ReceiptPdfSchool {
  name: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string | null;
  republiqueName: string;
  devise: string;
}

export interface ReceiptPdfStudent {
  nom: string;
  prenom: string;
  className: string;
  matricule: string;
  parentNom: string | null;
  parentTelephone: string | null;
}

export interface ReceiptPdfBalance {
  dueFormatted: string;
  paidFormatted: string;
  remainingFormatted: string;
  settled: boolean;
}

export interface ReceiptPdfLabels {
  title: string;
  subtitle: string;
  receiptNumber: string;
  date: string;
  receivedFrom: string;
  student: string;
  class: string;
  matricule: string;
  guardian: string;
  phone: string;
  motif: string;
  paymentMethod: string;
  amount: string;
  amountWordsIntro: string;
  balanceTitle: string;
  balanceDue: string;
  balancePaid: string;
  balanceRemaining: string;
  balanceSettled: string;
  cashierSignature: string;
  schoolStamp: string;
  officialFooter: string;
  generatedOn: string;
}

export interface ReceiptPdfOptions {
  numeroRecu: string;
  dateFormatted: string;
  motifText: string;
  paymentMethodText: string;
  montantFormatted: string;
  amountWords: string;
  student: ReceiptPdfStudent | null;
  tuitionBalance: ReceiptPdfBalance | null;
  school: ReceiptPdfSchool;
  qrBuffer: Buffer;
  labels: ReceiptPdfLabels;
}

const COLORS = {
  text: '#111827',
  muted: '#6b7280',
  faint: '#9ca3af',
  border: '#d1d5db',
  primary: '#1d4ed8',
  success: '#16a34a',
  warning: '#d97706',
  shade: '#f3f4f6',
};

export async function buildReceiptPdf(opts: ReceiptPdfOptions): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  let y = doc.page.margins.top;
  const { school, labels } = opts;

  // Logo
  const logoRadius = 24;
  const logoCenterX = left + width / 2;
  const logoCenterY = y + logoRadius;
  const logoDrawn = drawCoverImage(
    doc,
    school.logoUrl,
    logoCenterX - logoRadius,
    logoCenterY - logoRadius,
    logoRadius * 2,
    logoRadius * 2,
    { circle: true },
  );
  if (!logoDrawn) {
    doc.circle(logoCenterX, logoCenterY, logoRadius).fill(COLORS.primary);
    doc
      .fontSize(15)
      .font('Helvetica-Bold')
      .fillColor('#ffffff')
      .text(computeInitials(school.name), left, logoCenterY - 7, { width, align: 'center' });
  }
  y = logoCenterY + logoRadius + 8;

  doc
    .fontSize(8)
    .font('Helvetica-Bold')
    .fillColor(COLORS.muted)
    .text(school.republiqueName.toUpperCase(), left, y, { width, align: 'center' });
  y = doc.y + 1;
  doc
    .fontSize(7.5)
    .font('Helvetica-Oblique')
    .fillColor(COLORS.faint)
    .text(school.devise, left, y, { width, align: 'center' });
  y = doc.y + 6;

  doc
    .fontSize(16)
    .font('Helvetica-Bold')
    .fillColor(COLORS.text)
    .text(school.name, left, y, { width, align: 'center' });
  y = doc.y + 3;
  doc
    .fontSize(9)
    .font('Helvetica')
    .fillColor(COLORS.muted)
    .text(school.address, left, y, { width, align: 'center' });
  y = doc.y + 1;
  doc.text(`${school.phone} | ${school.email}`, left, y, { width, align: 'center' });
  y = doc.y + 12;

  doc.moveTo(left, y).lineTo(left + width, y).strokeColor(COLORS.border).lineWidth(1).stroke();
  y += 10;

  doc
    .fontSize(13)
    .font('Helvetica-Bold')
    .fillColor(COLORS.text)
    .text(labels.title.toUpperCase(), left, y, { width, align: 'center' });
  y = doc.y + 12;

  // Title bar: receipt number + date
  doc.rect(left, y, width, 34).fill(COLORS.shade);
  doc
    .fontSize(7)
    .font('Helvetica-Bold')
    .fillColor(COLORS.muted)
    .text(labels.receiptNumber.toUpperCase(), left + 10, y + 6, { width: width / 2 - 10 });
  doc
    .fontSize(12)
    .font('Helvetica-Bold')
    .fillColor(COLORS.primary)
    .text(opts.numeroRecu, left + 10, y + 17, { width: width / 2 - 10 });
  doc
    .fontSize(7)
    .font('Helvetica-Bold')
    .fillColor(COLORS.muted)
    .text(labels.date.toUpperCase(), left + width / 2, y + 6, { width: width / 2 - 10, align: 'right' });
  doc
    .fontSize(10)
    .font('Helvetica-Bold')
    .fillColor(COLORS.text)
    .text(opts.dateFormatted, left + width / 2, y + 18, { width: width / 2 - 10, align: 'right' });
  y += 44;

  doc
    .fontSize(8)
    .font('Helvetica-Oblique')
    .fillColor(COLORS.faint)
    .text(labels.subtitle, left, y, { width, align: 'center' });
  y = doc.y + 14;

  // Received from
  doc
    .fontSize(7.5)
    .font('Helvetica-Bold')
    .fillColor(COLORS.muted)
    .text(labels.receivedFrom.toUpperCase(), left, y, { width });
  y = doc.y + 6;

  const colW = width / 4;
  const s = opts.student;
  const infoLabels = [labels.student, labels.class, labels.matricule, labels.guardian];
  const infoValues = [
    s ? `${s.nom} ${s.prenom}` : '—',
    s?.className ?? '—',
    s?.matricule ?? '—',
    s?.parentNom ?? '—',
  ];
  doc.fontSize(7).font('Helvetica-Bold').fillColor(COLORS.muted);
  infoLabels.forEach((label, i) => doc.text(label.toUpperCase(), left + i * colW, y, { width: colW - 8 }));
  const infoValTop = y + 12;
  doc.fontSize(9.5).font('Helvetica-Bold').fillColor(COLORS.text);
  infoValues.forEach((val, i) => doc.text(val, left + i * colW, infoValTop, { width: colW - 8 }));
  y = infoValTop + 16;
  if (s?.parentTelephone) {
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor(COLORS.muted)
      .text(`${labels.phone}: ${s.parentTelephone}`, left + colW * 3, y, { width: colW - 8 });
    y = doc.y;
  }
  y += 10;

  doc.moveTo(left, y).lineTo(left + width, y).strokeColor(COLORS.border).lineWidth(1).stroke();
  y += 14;

  // Payment details
  function row(label: string, value: string, valueColor = COLORS.text): void {
    doc
      .fontSize(8.5)
      .font('Helvetica-Bold')
      .fillColor(COLORS.muted)
      .text(label.toUpperCase(), left, y, { continued: false, width: width * 0.4 });
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor(valueColor)
      .text(value, left + width * 0.4, y, { width: width * 0.6, align: 'right' });
    y += 20;
  }
  row(labels.motif, opts.motifText);
  row(labels.paymentMethod, opts.paymentMethodText);
  doc.moveTo(left, y).lineTo(left + width, y).strokeColor(COLORS.border).lineWidth(0.5).stroke();
  y += 8;
  doc
    .fontSize(11)
    .font('Helvetica-Bold')
    .fillColor(COLORS.text)
    .text(labels.amount.toUpperCase(), left, y, { width: width * 0.4 });
  doc
    .fontSize(18)
    .font('Helvetica-Bold')
    .fillColor(COLORS.success)
    .text(opts.montantFormatted, left + width * 0.3, y - 3, { width: width * 0.7, align: 'right' });
  y += 26;

  // Amount in words (dashed box — the anti-tampering line)
  const wordsBoxH = 40;
  doc
    .rect(left, y, width, wordsBoxH)
    .dash(3, { space: 2 })
    .strokeColor(COLORS.border)
    .lineWidth(1)
    .stroke();
  doc.undash();
  doc
    .fontSize(7)
    .font('Helvetica-Bold')
    .fillColor(COLORS.muted)
    .text(labels.amountWordsIntro.toUpperCase(), left + 8, y + 6, { width: width - 16 });
  doc
    .fontSize(9.5)
    .font('Helvetica-Oblique')
    .fillColor(COLORS.text)
    .text(opts.amountWords, left + 8, y + 18, { width: width - 16 });
  y += wordsBoxH + 16;

  // Tuition balance snapshot
  if (opts.tuitionBalance) {
    const b = opts.tuitionBalance;
    doc
      .fontSize(7.5)
      .font('Helvetica-Bold')
      .fillColor(COLORS.muted)
      .text(labels.balanceTitle.toUpperCase(), left, y, { width });
    y = doc.y + 8;
    const bColW = width / 3;
    const bLabels = [labels.balanceDue, labels.balancePaid, labels.balanceRemaining];
    const bValues = [b.dueFormatted, b.paidFormatted, b.remainingFormatted];
    const bColors = [COLORS.text, COLORS.success, b.settled ? COLORS.text : COLORS.warning];
    doc.fontSize(7).font('Helvetica').fillColor(COLORS.muted);
    bLabels.forEach((l, i) => doc.text(l, left + i * bColW, y, { width: bColW - 8 }));
    const bValTop = y + 11;
    bValues.forEach((v, i) => {
      doc
        .fontSize(9.5)
        .font('Helvetica-Bold')
        .fillColor(bColors[i] as string)
        .text(v, left + i * bColW, bValTop, { width: bColW - 8 });
    });
    y = bValTop + 16;
    if (b.settled) {
      doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.success).text(labels.balanceSettled, left, y, {
        width,
      });
      y = doc.y + 6;
    }
    y += 6;
  }

  // Signatures + QR
  const sigW = 130;
  const qrSize = 60;
  const sigY = Math.max(y, doc.page.height - doc.page.margins.bottom - 130);
  doc.image(opts.qrBuffer, left, sigY, { width: qrSize, height: qrSize });

  const sig1X = left + width - sigW * 2 - 20;
  const sig2X = left + width - sigW;
  const lineY = sigY + qrSize - 10;
  doc.moveTo(sig1X, lineY).lineTo(sig1X + sigW, lineY).strokeColor(COLORS.text).lineWidth(1).stroke();
  doc
    .fontSize(7.5)
    .font('Helvetica-Bold')
    .fillColor(COLORS.text)
    .text(labels.cashierSignature.toUpperCase(), sig1X, lineY + 4, { width: sigW, align: 'center' });
  doc.moveTo(sig2X, lineY).lineTo(sig2X + sigW, lineY).strokeColor(COLORS.text).lineWidth(1).stroke();
  doc
    .fontSize(7.5)
    .font('Helvetica-Bold')
    .fillColor(COLORS.text)
    .text(labels.schoolStamp.toUpperCase(), sig2X, lineY + 4, { width: sigW, align: 'center' });

  // Footer
  const footerY = doc.page.height - doc.page.margins.bottom - 22;
  doc
    .fontSize(7)
    .font('Helvetica')
    .fillColor(COLORS.faint)
    .text(labels.officialFooter, left, footerY, { width, align: 'center' });
  doc.text(labels.generatedOn, left, footerY + 10, { width, align: 'center' });

  doc.end();
  return done;
}
