// Shared data-loader for a payment receipt — used by both the printable
// HTML view (src/app/accounting/receipt/[paymentId]/page.tsx) and the PDF
// download (src/app/api/accounting/receipt/[paymentId]/pdf/route.ts) so the
// two can never show different figures for the same payment. Only
// inscription/réinscription/scolarité payments have a receipt — a teacher
// payment or a freeform "AUTRE" revenue entry is money the school pays out
// or an internal entry, not proof handed to a parent.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { createWithNumeroRecu } from '@/lib/server/receipt-number';
import { getSchoolSettings, type SchoolSettingsData } from '@/lib/server/school-settings';

const RECEIPTABLE_CATEGORIES = ['INSCRIPTION', 'REINSCRIPTION', 'SCOLARITE'];

export interface ReceiptTuitionBalance {
  due: number | null;
  paidTotal: number;
  remaining: number | null;
}

export interface ReceiptData {
  id: string;
  numeroRecu: string;
  date: Date;
  montant: number;
  moyenPaiement: string;
  categorie: string;
  periode: string | null;
  anneeScolaire: string | null;
  student: {
    nom: string;
    prenom: string;
    matricule: string;
    className: string;
    parentNom: string | null;
    parentTelephone: string | null;
    parentEmail: string | null;
  } | null;
  school: SchoolSettingsData;
  tuitionBalance: ReceiptTuitionBalance | null;
}

export async function getReceiptData(
  prisma: PrismaClient,
  schoolId: string,
  paymentId: string,
): Promise<ReceiptData | null> {
  const payment = await prisma.revenuePayment.findUnique({
    where: { id: paymentId },
    include: { student: { include: { schoolClass: true } } },
  });
  if (!payment || !RECEIPTABLE_CATEGORIES.includes(payment.categorie)) return null;

  // Lazily backfill a receipt number for payments recorded before this
  // feature existed — assigned once, on first view, and persisted so the
  // same payment always shows the same number afterwards.
  let numeroRecu = payment.numeroRecu;
  if (!numeroRecu) {
    numeroRecu = await createWithNumeroRecu(
      prisma,
      payment.date,
      async (tx, num) => {
        // Re-check inside the transaction: another concurrent view of this
        // same payment may have already assigned a number between our
        // first read above and now.
        const fresh = await tx.revenuePayment.findUnique({
          where: { id: payment.id },
          select: { numeroRecu: true },
        });
        if (fresh?.numeroRecu) return fresh.numeroRecu;
        await tx.revenuePayment.update({ where: { id: payment.id }, data: { numeroRecu: num } });
        return num;
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
  }

  const school = await getSchoolSettings(prisma, schoolId);

  let tuitionBalance: ReceiptTuitionBalance | null = null;
  if (payment.categorie === 'SCOLARITE' && payment.student) {
    const anneeScolaire = payment.anneeScolaire ?? payment.student.anneeScolaire;
    const [plan, paidAgg] = await Promise.all([
      prisma.tuitionPlan.findFirst({
        where: { classId: payment.student.classId, anneeScolaire },
      }),
      prisma.revenuePayment.aggregate({
        where: { categorie: 'SCOLARITE', studentId: payment.studentId, anneeScolaire },
        _sum: { montant: true },
      }),
    ]);
    const due = plan?.montantAnnuel ?? null;
    const paidTotal = paidAgg._sum.montant ?? 0;
    tuitionBalance = {
      due,
      paidTotal: due !== null ? Math.min(paidTotal, due) : paidTotal,
      remaining: due !== null ? Math.max(0, due - paidTotal) : null,
    };
  }

  return {
    id: payment.id,
    numeroRecu,
    date: payment.date,
    montant: payment.montant,
    moyenPaiement: payment.moyenPaiement,
    categorie: payment.categorie,
    periode: payment.periode,
    anneeScolaire: payment.anneeScolaire,
    student: payment.student
      ? {
          nom: payment.student.nom,
          prenom: payment.student.prenom,
          matricule: payment.student.matricule,
          className: payment.student.schoolClass.name,
          parentNom: payment.student.parentNom,
          parentTelephone: payment.student.parentTelephone,
          parentEmail: payment.student.parentEmail,
        }
      : null,
    school,
    tuitionBalance,
  };
}
