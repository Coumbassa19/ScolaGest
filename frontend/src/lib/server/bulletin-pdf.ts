// Renders one PDF page per student, all appended to a single PDFDocument in
// the given order — used by GET /api/grades/bulletins/pdf ("télécharger
// tous les bulletins") to produce one multi-page PDF for a whole class
// instead of one file per student. Layout mirrors /bulletin (same wording
// from src/lib/bulletin-format.ts, same rank formatting from
// src/lib/rang.ts) so a page here matches what /bulletin shows on screen.
import 'server-only';
import PDFDocument from 'pdfkit';
import {
  computeInitials,
  PERIODE_LABEL,
  getAppreciation,
  decisionTextPlain,
} from '@/lib/bulletin-format';
import { formatRang } from '@/lib/rang';
import { drawCoverImage } from '@/lib/server/pdf-image';

export interface BulletinPdfGrade {
  subjectNom: string;
  coefficient: number;
  valeur: number;
}

export interface BulletinPdfSchool {
  name: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string | null;
}

export interface BulletinPdfStudent {
  nom: string;
  prenom: string;
  sexe: string;
  matricule: string;
  className: string;
  dateNaissance: Date | null;
  grades: BulletinPdfGrade[];
  observation: string;
  rang: number | null;
  rangTied: boolean;
  totalClasse: number;
}

export interface BulletinPdfOptions {
  periode: string;
  anneeScolaire: string;
  students: BulletinPdfStudent[];
  school: BulletinPdfSchool;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

const COLORS = {
  text: '#111827',
  muted: '#6b7280',
  faint: '#9ca3af',
  border: '#d1d5db',
  rowBorder: '#e5e7eb',
  primary: '#1d4ed8',
  success: '#16a34a',
  warning: '#d97706',
  shade: '#f3f4f6',
};

export async function buildBulletinsPdf(opts: BulletinPdfOptions): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: false, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const students = opts.students.length > 0 ? opts.students : [];
  for (const student of students) {
    doc.addPage();
    drawOnePage(doc, student, opts.periode, opts.anneeScolaire, opts.school);
  }
  if (students.length === 0) doc.addPage();

  doc.end();
  return done;
}

function drawOnePage(
  doc: PDFKit.PDFDocument,
  student: BulletinPdfStudent,
  periode: string,
  anneeScolaire: string,
  school: BulletinPdfSchool,
): void {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  let y = doc.page.margins.top;

  // School logo — the uploaded logo image if there is one, cropped into a
  // circle to match the round mark on the HTML bulletin; otherwise a
  // circle with the school's initials as a fallback.
  const logoRadius = 22;
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
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor('#ffffff')
      .text(computeInitials(school.name), left, logoCenterY - 7, { width, align: 'center' });
  }
  y = logoCenterY + logoRadius + 10;

  // School header
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
  y = doc.y + 10;

  doc
    .moveTo(left, y)
    .lineTo(left + width, y)
    .strokeColor(COLORS.border)
    .lineWidth(1)
    .stroke();
  y += 12;

  doc
    .fontSize(11)
    .font('Helvetica-Bold')
    .fillColor(COLORS.text)
    .text(
      `BULLETIN DE NOTES — ${(PERIODE_LABEL[periode] ?? periode).toUpperCase()} — ${anneeScolaire}`,
      left,
      y,
      {
        width,
        align: 'center',
      },
    );
  y = doc.y + 16;

  // Student info — 4 columns
  const colW = width / 4;
  const infoLabels = ['NOM ET PRÉNOM', 'CLASSE', 'MATRICULE', 'DATE DE NAISSANCE'];
  const infoValues = [
    `${student.nom} ${student.prenom}`,
    student.className,
    student.matricule,
    student.dateNaissance ? fmtDate(student.dateNaissance) : '—',
  ];
  doc.fontSize(7).font('Helvetica-Bold').fillColor(COLORS.muted);
  infoLabels.forEach((label, i) => {
    doc.text(label, left + i * colW, y, { width: colW - 8 });
  });
  const infoValTop = y + 12;
  doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.text);
  infoValues.forEach((val, i) => {
    doc.text(val, left + i * colW, infoValTop, { width: colW - 8 });
  });
  y = infoValTop + 24;

  doc
    .moveTo(left, y)
    .lineTo(left + width, y)
    .strokeColor(COLORS.rowBorder)
    .lineWidth(1)
    .stroke();
  y += 14;

  // Grades table
  const colMatiere = width * 0.4;
  const colCoeff = width * 0.15;
  const colNote = width * 0.15;
  const colAppr = width * 0.3;
  if (student.grades.length === 0) {
    doc
      .fontSize(9.5)
      .font('Helvetica')
      .fillColor(COLORS.muted)
      .text('Aucune note enregistrée pour cette période.', left, y, { width, align: 'center' });
    y = doc.y + 20;
  } else {
    let x = left;
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor(COLORS.muted);
    doc.text('MATIÈRE', x + 4, y, { width: colMatiere - 8 });
    x += colMatiere;
    doc.text('COEFF.', x, y, { width: colCoeff, align: 'center' });
    x += colCoeff;
    doc.text('NOTE', x, y, { width: colNote, align: 'center' });
    x += colNote;
    doc.text('APPRÉCIATION', x, y, { width: colAppr, align: 'center' });
    y += 13;
    doc
      .moveTo(left, y)
      .lineTo(left + width, y)
      .strokeColor(COLORS.text)
      .lineWidth(1)
      .stroke();
    y += 6;

    for (const g of student.grades) {
      x = left;
      doc
        .fontSize(9.5)
        .font('Helvetica-Bold')
        .fillColor(COLORS.text)
        .text(g.subjectNom, x + 4, y, {
          width: colMatiere - 8,
        });
      x += colMatiere;
      doc.text(String(g.coefficient), x, y, { width: colCoeff, align: 'center' });
      x += colCoeff;
      doc.text(`${g.valeur}/20`, x, y, { width: colNote, align: 'center' });
      x += colNote;
      doc
        .font('Helvetica')
        .fillColor(COLORS.muted)
        .text(getAppreciation(g.valeur), x, y, { width: colAppr, align: 'center' });
      y += 17;
      doc
        .moveTo(left, y - 4)
        .lineTo(left + width, y - 4)
        .strokeColor(COLORS.rowBorder)
        .lineWidth(0.5)
        .stroke();
    }

    // Moyenne générale row (shaded)
    const totalCoeff = student.grades.reduce((s, g) => s + g.coefficient, 0);
    const totalPoints = student.grades.reduce((s, g) => s + g.valeur * g.coefficient, 0);
    const moyenne = totalCoeff > 0 ? totalPoints / totalCoeff : null;

    doc.rect(left, y, width, 22).fill(COLORS.shade);
    x = left;
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor(COLORS.text);
    doc.text('MOYENNE GÉNÉRALE', x + 4, y + 6, { width: colMatiere - 8 });
    x += colMatiere;
    doc.text(String(totalCoeff), x, y + 6, { width: colCoeff, align: 'center' });
    x += colCoeff;
    doc
      .fillColor(COLORS.primary)
      .text(moyenne !== null ? `${moyenne.toFixed(2)}/20` : '—', x, y + 6, {
        width: colNote,
        align: 'center',
      });
    x += colNote;
    doc.fillColor(COLORS.text).text(moyenne !== null ? getAppreciation(moyenne) : '—', x, y + 6, {
      width: colAppr,
      align: 'center',
    });
    y += 34;
  }

  const totalCoeffForDecision = student.grades.reduce((s, g) => s + g.coefficient, 0);
  const totalPointsForDecision = student.grades.reduce((s, g) => s + g.valeur * g.coefficient, 0);
  const moyenne = totalCoeffForDecision > 0 ? totalPointsForDecision / totalCoeffForDecision : null;

  // Three boxes: Observations / Décision / Rang
  const boxGap = 12;
  const boxW = (width - boxGap * 2) / 3;
  const boxH = 60;
  const labelY = y;
  const boxTop = y + 12;

  doc
    .fontSize(7)
    .font('Helvetica-Bold')
    .fillColor(COLORS.muted)
    .text('OBSERVATIONS DU CONSEIL', left, labelY, {
      width: boxW,
    });
  doc.rect(left, boxTop, boxW, boxH).strokeColor(COLORS.border).lineWidth(1).stroke();
  doc
    .fontSize(8.5)
    .font('Helvetica')
    .fillColor(COLORS.text)
    .text(student.observation || '—', left + 6, boxTop + 6, {
      width: boxW - 12,
      height: boxH - 12,
    });

  const decX = left + boxW + boxGap;
  doc
    .fontSize(7)
    .font('Helvetica-Bold')
    .fillColor(COLORS.muted)
    .text('DÉCISION', decX, labelY, { width: boxW });
  const decColor = moyenne !== null && moyenne >= 10 ? COLORS.success : COLORS.warning;
  doc.rect(decX, boxTop, boxW, boxH).strokeColor(decColor).lineWidth(1.5).stroke();
  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .fillColor(decColor)
    .text(decisionTextPlain(moyenne), decX + 6, boxTop + boxH / 2 - 10, {
      width: boxW - 12,
      align: 'center',
    });

  const rangX = decX + boxW + boxGap;
  doc
    .fontSize(7)
    .font('Helvetica-Bold')
    .fillColor(COLORS.muted)
    .text('RANG', rangX, labelY, { width: boxW });
  doc.rect(rangX, boxTop, boxW, boxH).strokeColor(COLORS.primary).lineWidth(1.5).stroke();
  const rangLabel =
    student.rang !== null
      ? `${formatRang(student.rang, student.sexe, student.rangTied)}/${student.totalClasse}`
      : '—';
  doc
    .fontSize(15)
    .font('Helvetica-Bold')
    .fillColor(COLORS.primary)
    .text(rangLabel, rangX, boxTop + boxH / 2 - 9, { width: boxW, align: 'center' });

  y = boxTop + boxH + 40;

  // Signature
  const sigW = 170;
  const sigX = left + width - sigW;
  doc
    .moveTo(sigX, y)
    .lineTo(sigX + sigW, y)
    .strokeColor(COLORS.text)
    .lineWidth(1)
    .stroke();
  doc
    .fontSize(8)
    .font('Helvetica-Bold')
    .fillColor(COLORS.text)
    .text('LE DIRECTEUR', sigX, y + 4, { width: sigW, align: 'center' });

  // Footer
  const footerY = doc.page.height - doc.page.margins.bottom - 22;
  doc
    .fontSize(7)
    .font('Helvetica')
    .fillColor(COLORS.faint)
    .text('Document officiel généré par ScolaGest — Confidentiel', left, footerY, {
      width,
      align: 'center',
    });
  doc.text(`Date: ${fmtDate(new Date())}`, left, footerY + 10, { width, align: 'center' });
}
