import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import TeacherPaymentForm from '@/components/forms/TeacherPaymentForm';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Modifier le paiement',
};

function hoursBetween(heureDebut: string, heureFin: string): number {
  const [h1, m1] = heureDebut.split(':').map(Number);
  const [h2, m2] = heureFin.split(':').map(Number);
  if (h1 === undefined || m1 === undefined || h2 === undefined || m2 === undefined) return 0;
  if (Number.isNaN(h1) || Number.isNaN(m1) || Number.isNaN(h2) || Number.isNaN(m2)) return 0;
  return Math.max(0, (h2 * 60 + m2 - (h1 * 60 + m1)) / 60);
}

export default async function EditTeacherPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const staff = await requirePageAuth({ menuKey: 'accounting' });
  const prisma = staff.user.prisma;

  const t = await getTranslations('accounting.teacherPayments.edit');
  const tc = await getTranslations('accounting.common');
  const { id } = await params;

  const [payment, teachers, scheduleEntries] = await Promise.all([
    prisma.teacherPayment.findUnique({ where: { id } }),
    prisma.teacher.findMany({ orderBy: [{ nom: 'asc' }, { prenom: 'asc' }] }),
    prisma.scheduleEntry.findMany({
      where: { teacherId: { not: null } },
      select: { teacherId: true, heureDebut: true, heureFin: true },
    }),
  ]);

  if (!payment) notFound();

  const weeklyHoursByTeacher = new Map<string, number>();
  for (const e of scheduleEntries) {
    if (!e.teacherId) continue;
    const hours = hoursBetween(e.heureDebut, e.heureFin);
    weeklyHoursByTeacher.set(e.teacherId, (weeklyHoursByTeacher.get(e.teacherId) ?? 0) + hours);
  }

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar
        activeItem="accounting"
        activeSubmenu="accounting-teacher-payments"
        expandedMenu="accounting"
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary">
          <Link
            href="/accounting/teacher-payments"
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
          <TeacherPaymentForm
            paymentId={payment.id}
            teachers={teachers.map((t) => ({
              id: t.id,
              nom: t.nom,
              prenom: t.prenom,
              tauxHoraire: t.tauxHoraire,
              weeklyHours: weeklyHoursByTeacher.get(t.id) ?? 0,
            }))}
            initialData={{
              teacherId: payment.teacherId,
              periode: payment.periode,
              montant: String(payment.montant),
              moyenPaiement: payment.moyenPaiement as 'ESPECES' | 'ORANGE_MONEY' | 'VIREMENT',
            }}
          />
        </div>
      </div>
    </div>
  );
}
