import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import TuitionPaymentForm from '@/components/forms/TuitionPaymentForm';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Modifier le paiement',
};

export default async function EditTuitionPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const staff = await requirePageAuth({ menuKey: 'accounting' });
  const prisma = staff.user.prisma;

  const t = await getTranslations('accounting.tuition.edit');
  const tc = await getTranslations('accounting.common');
  const { id } = await params;

  const [payment, students, currentYear, classes, paidAgg] = await Promise.all([
    prisma.revenuePayment.findUnique({ where: { id } }),
    prisma.student.findMany({
      include: { schoolClass: true },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    }),
    prisma.academicYear.findFirst({ where: { isCurrent: true }, select: { label: true } }),
    prisma.schoolClass.findMany({ include: { tuitionPlans: true } }),
    prisma.revenuePayment.groupBy({
      by: ['studentId'],
      where: { categorie: 'SCOLARITE', studentId: { not: null } },
      _sum: { montant: true },
    }),
  ]);

  if (!payment || payment.categorie !== 'SCOLARITE') notFound();

  const anneeScolaire = currentYear?.label ?? '2024-2025';
  const dueByClass = new Map<string, number>();
  for (const c of classes) {
    const plan = c.tuitionPlans.find((p) => p.anneeScolaire === anneeScolaire);
    if (plan) dueByClass.set(c.id, plan.montantAnnuel);
  }
  const paidByStudent = new Map<string, number>();
  for (const row of paidAgg) {
    if (row.studentId) paidByStudent.set(row.studentId, row._sum.montant ?? 0);
  }

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar
        activeItem="accounting"
        activeSubmenu="accounting-tuition"
        expandedMenu="accounting"
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary">
          <Link
            href="/accounting/tuition"
            className="flex items-center gap-2 text-muted-foreground text-sm font-semibold mb-4"
          >
            <Icon i="arrow-left" size={16} />
            {t('backLink')}
          </Link>
          <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
            {tc('editPaymentTitle')}
          </h1>
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <TuitionPaymentForm
            paymentId={payment.id}
            students={students.map((s) => ({
              id: s.id,
              nom: s.nom,
              prenom: s.prenom,
              matricule: s.matricule,
              className: s.schoolClass.name,
              due: dueByClass.get(s.classId) ?? null,
              paid: paidByStudent.get(s.id) ?? 0,
            }))}
            initialData={{
              studentId: payment.studentId ?? '',
              periode: (payment.periode ?? 'T1') as 'T1' | 'T2' | 'T3' | 'ANNUEL',
              montant: String(payment.montant),
              moyenPaiement: payment.moyenPaiement as
                | 'ESPECES'
                | 'WAVE'
                | 'ORANGE_MONEY'
                | 'VIREMENT',
            }}
          />
        </div>
      </div>
    </div>
  );
}
