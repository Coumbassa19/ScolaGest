// Renders the student ID card as a PDF — one real-size card
// (CR80: 85.6mm × 53.98mm) per student. Used by both:
//  - GET /api/student-card/pdf  — one student, one card centered on an A4 page.
//  - GET /api/student-cards/pdf — a whole class, tiled 2×4 per A4 page (a
//    print-and-cut sheet), pages following each other for classes with
//    more than 8 students.
// Layout mirrors the HTML card (src/components/StudentIdCard.tsx) — same
// wording, same Guinea-flag stripes, same logo/photo cropping rules (see
// src/lib/server/pdf-image.ts) — so a printed card matches the on-screen
// preview.
import 'server-only';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { computeInitials } from '@/lib/bulletin-format';
import { formatCardDate, formatAnneeScolaireDisplay, sexeLabel } from '@/lib/student-card-format';
import { drawCoverImage } from '@/lib/server/pdf-image';
import type { StudentCardData } from '@/lib/server/student-card';

const MM = 2.83465; // points per millimetre
export const CARD_WIDTH = 85.6 * MM; // ≈ 242.6pt — standard CR80 ID card size
export const CARD_HEIGHT = 53.98 * MM; // ≈ 153.0pt

const COLORS = {
  text: '#111827',
  muted: '#6b7280',
  border: '#f2a98a',
  primary: '#1d4ed8',
};

const GUINEA_FLAG = ['#CE1126', '#FCD116', '#009460'];

async function makeQrBuffer(matricule: string): Promise<Buffer> {
  return QRCode.toBuffer(matricule, { margin: 0, width: 160 });
}

function drawCard(
  doc: PDFKit.PDFDocument,
  originX: number,
  originY: number,
  data: StudentCardData,
  qrBuffer: Buffer,
): void {
  const w = CARD_WIDTH;
  const h = CARD_HEIGHT;
  const border = 4;

  // Coral outer border + white inner card — a mostly-rectangular frame (small
  // radius), matching the reference card rather than a heavily rounded pill.
  doc.roundedRect(originX, originY, w, h, 3).fill(COLORS.border);
  const ix = originX + border;
  const iy = originY + border;
  const iw = w - border * 2;
  const ih = h - border * 2;
  doc.roundedRect(ix, iy, iw, ih, 2).fill('#ffffff');

  // Flag (top-left) — three vertical stripes, sized to read clearly at print size.
  const flagW = 30;
  const flagH = 21;
  const flagX = ix + 4;
  const flagY = iy + 4;
  const stripeW = flagW / 3;
  GUINEA_FLAG.forEach((color, i) => {
    doc.rect(flagX + i * stripeW, flagY, stripeW, flagH).fill(color);
  });
  doc.rect(flagX, flagY, flagW, flagH).strokeColor('#00000022').lineWidth(0.5).stroke();

  // Logo (top-right) — real logo if uploaded, else initials.
  const logoRadius = 13;
  const logoCx = ix + iw - 4 - logoRadius;
  const logoCy = iy + 4 + logoRadius;
  const logoDrawn = drawCoverImage(
    doc,
    data.school.logoUrl,
    logoCx - logoRadius,
    logoCy - logoRadius,
    logoRadius * 2,
    logoRadius * 2,
    { circle: true },
  );
  if (!logoDrawn) {
    doc.circle(logoCx, logoCy, logoRadius).fill(COLORS.primary);
    doc
      .fontSize(6)
      .font('Helvetica-Bold')
      .fillColor('#ffffff')
      .text(computeInitials(data.school.name), logoCx - logoRadius, logoCy - 3.5, {
        width: logoRadius * 2,
        align: 'center',
      });
  }

  // Header text (centered, inset to clear the now-larger flag/logo).
  const textX = ix + 38;
  const textW = iw - 76;
  doc
    .fontSize(6.5)
    .font('Helvetica-Bold')
    .fillColor(COLORS.text)
    .text(data.school.republiqueName.toUpperCase(), textX, iy + 4, {
      width: textW,
      align: 'center',
    });
  doc
    .fontSize(5)
    .font('Helvetica')
    .fillColor(COLORS.muted)
    .text(data.school.devise, textX, iy + 13, { width: textW, align: 'center' });
  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .fillColor(COLORS.text)
    .text(data.school.name.toUpperCase(), textX, iy + 20, { width: textW, align: 'center' });
  doc
    .fontSize(6.5)
    .font('Helvetica-Bold')
    .fillColor(COLORS.text)
    .text("CARTE D'IDENTITÉ SCOLAIRE", textX, iy + 32, { width: textW, align: 'center' });

  // Divider.
  const dividerY = iy + 43;
  doc
    .moveTo(ix + 3, dividerY)
    .lineTo(ix + iw - 3, dividerY)
    .strokeColor('#e5e7eb')
    .lineWidth(0.5)
    .stroke();

  // Body: photo + matricule (left), fields + QR (right).
  const bodyY = dividerY + 4;
  const photoW = 54;
  const photoH = 68;
  const photoX = ix + 4;
  const photoDrawn = drawCoverImage(doc, data.photoUrl, photoX, bodyY, photoW, photoH, {
    radius: 3,
  });
  if (!photoDrawn) {
    doc.roundedRect(photoX, bodyY, photoW, photoH, 3).fillAndStroke('#f3f4f6', '#e5e7eb');
  }
  doc
    .fontSize(6)
    .font('Helvetica-Bold')
    .fillColor(COLORS.text)
    .text(`MAT. : ${data.matricule}`, photoX - 2, bodyY + photoH + 3, {
      width: photoW + 4,
      align: 'center',
    });

  const colX = photoX + photoW + 6;
  const colW = ix + iw - 3 - colX;
  let ly = bodyY;
  const lineH = 9.5;
  doc.fontSize(6.2).font('Helvetica');

  function field(label: string, value: string, x = colX, width = colW): void {
    doc
      .font('Helvetica')
      .fillColor(COLORS.text)
      .text(`${label} `, x, ly, { continued: true, width });
    doc.font('Helvetica-Bold').text(value);
  }

  field('ANNÉE SCOLAIRE :', formatAnneeScolaireDisplay(data.anneeScolaire));
  ly += lineH;
  field('Nom :', data.nom.toUpperCase());
  ly += lineH;
  field('Prénom :', data.prenom);
  ly += lineH;
  field('Née le :', data.dateNaissance ? formatCardDate(data.dateNaissance) : '—');
  ly += lineH;
  field('Sexe :', sexeLabel(data.sexe), colX, colW / 2);
  field('Classe :', data.className, colX + colW / 2, colW / 2);
  ly += lineH;
  field('Contact :', data.parentTelephone || '—');

  // QR code, bottom-right of the body area.
  const qrSize = 36;
  const qrX = ix + iw - 4 - qrSize;
  const qrY = iy + ih - 4 - qrSize;
  doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
}

export async function buildStudentCardPdf(data: StudentCardData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const qrBuffer = await makeQrBuffer(data.matricule);
  const originX = (doc.page.width - CARD_WIDTH) / 2;
  const originY = (doc.page.height - CARD_HEIGHT) / 2;
  drawCard(doc, originX, originY, data, qrBuffer);

  doc.end();
  return done;
}

const GRID_COLS = 2;
const GRID_ROWS = 4;
const GRID_GAP_X = 20;
const GRID_GAP_Y = 20;
const GRID_MARGIN = 30;

export async function buildClassCardsPdf(students: StudentCardData[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const perPage = GRID_COLS * GRID_ROWS;
  const list = students.length > 0 ? students : [];

  for (let i = 0; i < list.length; i++) {
    if (i % perPage === 0) doc.addPage();
    const student = list[i];
    if (!student) continue;
    const indexOnPage = i % perPage;
    const col = indexOnPage % GRID_COLS;
    const row = Math.floor(indexOnPage / GRID_COLS);
    const originX = GRID_MARGIN + col * (CARD_WIDTH + GRID_GAP_X);
    const originY = GRID_MARGIN + row * (CARD_HEIGHT + GRID_GAP_Y);
    const qrBuffer = await makeQrBuffer(student.matricule);
    drawCard(doc, originX, originY, student, qrBuffer);
  }
  if (list.length === 0) doc.addPage();

  doc.end();
  return done;
}
