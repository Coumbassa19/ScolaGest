// Renders the student ID card as a PDF — one real-size card
// (CR80: 85.6mm × 53.98mm) per student. Used by both:
//  - GET /api/student-card/pdf  — one student, one card centered on an A4 page.
//  - GET /api/student-cards/pdf — a whole class, tiled 2×4 per A4 page (a
//    print-and-cut sheet), pages following each other for classes with
//    more than 8 students.
// Layout mirrors the HTML card (src/components/StudentIdCard.tsx) — same
// wording, same accent colour, same Guinea-flag stripes, same logo/photo
// fit rules (see src/lib/server/pdf-image.ts), same faint school-logo (or
// "ScolaGest" text, if no logo) watermark — so a printed card matches the
// on-screen preview.
import 'server-only';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { computeInitials } from '@/lib/bulletin-format';
import { formatCardDate, formatAnneeScolaireDisplay, sexeLabel } from '@/lib/student-card-format';
import { drawCoverImage, drawContainImage } from '@/lib/server/pdf-image';
import type { StudentCardData } from '@/lib/server/student-card';

const MM = 2.83465; // points per millimetre
export const CARD_WIDTH = 85.6 * MM; // ≈ 242.6pt — standard CR80 ID card size
export const CARD_HEIGHT = 53.98 * MM; // ≈ 153.0pt

const COLORS = {
  text: '#111827',
  muted: '#6b7280',
  accent: '#0B6B3A',
};

const GUINEA_FLAG = ['#CE1126', '#FCD116', '#009460'];

async function makeQrBuffer(matricule: string): Promise<Buffer> {
  return QRCode.toBuffer(matricule, { margin: 0, width: 160 });
}

// Shrinks a font size until `text` fits `maxWidth` on one line, down to
// `min` — used where a school's own free-text (name, ministry) could
// otherwise wrap and spill past a fixed-height band.
function fitFontSize(
  doc: PDFKit.PDFDocument,
  font: string,
  text: string,
  maxWidth: number,
  start: number,
  min: number,
): number {
  doc.font(font);
  let size = start;
  while (size > min && doc.fontSize(size).widthOfString(text) > maxWidth) {
    size -= 0.3;
  }
  return size;
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

  // Accent-coloured outer border + white inner card — a mostly-rectangular
  // frame (small radius), matching the reference card rather than a heavily
  // rounded pill.
  doc.roundedRect(originX, originY, w, h, 3).fill(COLORS.accent);
  const ix = originX + border;
  const iy = originY + border;
  const iw = w - border * 2;
  const ih = h - border * 2;
  doc.roundedRect(ix, iy, iw, ih, 2).fill('#ffffff');

  // Security watermark — the school's own logo, large and very faint,
  // behind everything (drawn before any other content). Falls back to a
  // faint diagonal "ScolaGest" mark when no logo is uploaded yet. Clipped
  // to the inner card so it never bleeds past the rounded corners.
  doc.save();
  doc.roundedRect(ix, iy, iw, ih, 2).clip();
  const watermarkSize = Math.min(iw, ih) * 0.85;
  const watermarkDrawn = drawContainImage(
    doc,
    data.school.logoUrl,
    ix + (iw - watermarkSize) / 2,
    iy + (ih - watermarkSize) / 2,
    watermarkSize,
    watermarkSize,
    0.1,
  );
  if (!watermarkDrawn) {
    doc
      .rotate(-22, { origin: [ix + iw / 2, iy + ih / 2] })
      .fontSize(30)
      .font('Helvetica-Bold')
      .fillColor(COLORS.accent)
      .fillOpacity(0.07)
      .text('SCOLAGEST', ix - 40, iy + ih / 2 - 16, { width: iw + 80, align: 'center' });
  }
  doc.restore();
  doc.fillOpacity(1);

  // Flag (top-left) — the school's own upload if set, else the default
  // 3-stripe Guinea flag, sized to read clearly at print size.
  const flagW = 32;
  const flagH = 22;
  const flagX = ix + 4;
  const flagY = iy + 3;
  const flagDrawn = drawCoverImage(doc, data.school.flagUrl, flagX, flagY, flagW, flagH);
  if (!flagDrawn) {
    const stripeW = flagW / 3;
    GUINEA_FLAG.forEach((color, i) => {
      doc.rect(flagX + i * stripeW, flagY, stripeW, flagH).fill(color);
    });
  }
  doc.rect(flagX, flagY, flagW, flagH).strokeColor('#00000022').lineWidth(0.5).stroke();

  // Logo (top-right) — real logo if uploaded, shown whole and undistorted
  // (no crop, no circle crop — just fit inside the box); else initials.
  const logoW = 32;
  const logoH = 22;
  const logoX = ix + iw - 4 - logoW;
  const logoY = iy + 3;
  const logoDrawn = drawContainImage(doc, data.school.logoUrl, logoX, logoY, logoW, logoH);
  if (!logoDrawn) {
    doc.roundedRect(logoX, logoY, logoW, logoH, 2).fill(COLORS.accent);
    doc
      .fontSize(6)
      .font('Helvetica-Bold')
      .fillColor('#ffffff')
      .text(computeInitials(data.school.name), logoX, logoY + logoH / 2 - 3, {
        width: logoW,
        align: 'center',
      });
  }

  // Header text (centered, inset to clear the flag/logo) — République,
  // devise, and Ministry (matching the reference card's ministry line,
  // directly under the devise); the school's own identity is on the footer
  // bar, like the reference card's ministry-header / institution-footer split.
  const textX = ix + 40;
  const textW = iw - 80;
  doc
    .fontSize(6.5)
    .font('Helvetica-Bold')
    .fillColor(COLORS.text)
    .text(data.school.republiqueName.toUpperCase(), textX, iy + 2, {
      width: textW,
      align: 'center',
    });
  doc
    .fontSize(4.8)
    .font('Helvetica')
    .fillColor(COLORS.muted)
    .text(data.school.devise, textX, iy + 9.5, { width: textW, align: 'center' });
  const ministryFontSize = fitFontSize(
    doc,
    'Helvetica-Oblique',
    data.school.ministryName,
    textW,
    5.2,
    3.8,
  );
  doc
    .fontSize(ministryFontSize)
    .font('Helvetica-Oblique')
    .fillColor(COLORS.muted)
    .text(data.school.ministryName, textX, iy + 15, { width: textW, align: 'center' });

  // Title band — boxed between two accent rules, like the reference card.
  // Sized generously since it's the card's title.
  const bandTopY = iy + 27;
  const bandBottomY = iy + 40;
  doc
    .moveTo(ix + 3, bandTopY)
    .lineTo(ix + iw - 3, bandTopY)
    .strokeColor(COLORS.accent)
    .lineWidth(1.2)
    .stroke();
  doc
    .fontSize(8.5)
    .font('Helvetica-Bold')
    .fillColor(COLORS.accent)
    .text("CARTE D'IDENTITÉ SCOLAIRE", ix + 3, bandTopY + 2.4, {
      width: iw - 6,
      align: 'center',
    });
  doc
    .moveTo(ix + 3, bandBottomY)
    .lineTo(ix + iw - 3, bandBottomY)
    .strokeColor(COLORS.accent)
    .lineWidth(1.2)
    .stroke();

  // Body: photo (left) and QR (right) are twin boxes — same size, same
  // vertical position, same alignment — with the student's fields in
  // between. The photo keeps its accent border; the QR side stays
  // border-free so the code itself reads cleanly.
  const footerH = 13;
  const bodyY = bandBottomY + 4;

  const boxW = 48;
  const boxH = 62;
  const photoX = ix + 4;
  const qrBoxX = ix + iw - 4 - boxW;

  const photoDrawn = drawCoverImage(doc, data.photoUrl, photoX, bodyY, boxW, boxH, { radius: 3 });
  if (!photoDrawn) {
    doc.roundedRect(photoX, bodyY, boxW, boxH, 3).fillAndStroke('#f3f4f6', '#e5e7eb');
  }
  doc.roundedRect(photoX, bodyY, boxW, boxH, 3).lineWidth(1.2).strokeColor(COLORS.accent).stroke();

  const colX = photoX + boxW + 6;
  const colW = qrBoxX - colX - 6;

  let ly = bodyY;
  const lineH = 9.2;

  function field(label: string, value: string, x = colX, width = colW): void {
    doc
      .font('Helvetica')
      .fontSize(6.2)
      .fillColor(COLORS.muted)
      .text(`${label} `, x, ly, { continued: true, width });
    doc.font('Helvetica-Bold').fillColor(COLORS.text).text(value);
  }

  // Like field(), but shrinks the font until "label value" fits one line —
  // phone number lengths/formats vary a lot country to country (and the
  // school's own number is free-text), so a fixed font size can't assume
  // any of them fit; without this the tail end (e.g. the last few digits)
  // wraps onto a second line that has nowhere left to go.
  function fieldFit(label: string, value: string, x = colX, width = colW): void {
    const size = fitFontSize(doc, 'Helvetica-Bold', `${label} ${value}`, width, 6.2, 4.5);
    doc
      .font('Helvetica')
      .fontSize(size)
      .fillColor(COLORS.muted)
      .text(`${label} `, x, ly, { continued: true, width, lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .fontSize(size)
      .fillColor(COLORS.text)
      .text(value, { lineBreak: false });
  }

  field('Année scolaire :', formatAnneeScolaireDisplay(data.anneeScolaire));
  ly += lineH;
  field('Matricule :', data.matricule);
  ly += lineH;
  field('Nom :', data.nom.toUpperCase());
  ly += lineH;
  field('Prénom(s) :', data.prenom);
  ly += lineH;
  field(
    'Né(e) le :',
    data.dateNaissance ? formatCardDate(data.dateNaissance) : '—',
    colX,
    colW / 2 + 8,
  );
  field('Sexe :', sexeLabel(data.sexe), colX + colW / 2 + 8, colW / 2 - 8);
  ly += lineH;
  field('Classe :', data.className);
  ly += lineH;
  fieldFit('Si trouvée :', data.school.phone);

  // QR box — same bounding box as the photo, mirrored on the right, but
  // no accent border so the code itself stays the focal point.
  doc.roundedRect(qrBoxX, bodyY, boxW, boxH, 3).fill('#ffffff');
  const qrSize = 40;
  const qrX = qrBoxX + (boxW - qrSize) / 2;
  const qrY = bodyY + 5;
  doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
  // A small drawn checkmark, not a Unicode "✓" glyph — pdfkit's built-in
  // Helvetica uses WinAnsiEncoding, which has no check-mark code point (it
  // silently prints as a stray apostrophe instead).
  const checkCx = qrBoxX + boxW / 2 - 13;
  const checkCy = qrY + qrSize + 5.5;
  doc
    .moveTo(checkCx, checkCy)
    .lineTo(checkCx + 1.6, checkCy + 1.8)
    .lineTo(checkCx + 4.4, checkCy - 2)
    .strokeColor(COLORS.accent)
    .lineWidth(1)
    .stroke();
  doc
    .fontSize(5)
    .font('Helvetica-Bold')
    .fillColor(COLORS.accent)
    .text('VÉRIFIÉ', qrBoxX, qrY + qrSize + 3, { width: boxW, align: 'center' });

  // Footer — school identity, matching the reference card's coloured
  // school-name bar. Shrinks the font until the name fits one line (down to
  // a floor, past which pdfkit's own ellipsis takes over) — a long school
  // name silently wrapping to a second line would spill past the footer's
  // fixed height and print outside the card border.
  doc.rect(ix, iy + ih - footerH, iw, footerH).fill(COLORS.accent);
  const footerText = data.school.name.toUpperCase();
  const footerTextW = iw - 8;
  const footerFontSize = fitFontSize(doc, 'Helvetica-Bold', footerText, footerTextW, 7, 4.5);
  doc
    .fontSize(footerFontSize)
    .fillColor('#ffffff')
    .text(footerText, ix + 4, iy + ih - footerH + (footerH - footerFontSize) / 2 - 1, {
      width: footerTextW,
      align: 'center',
      lineBreak: false,
      ellipsis: true,
    });
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
