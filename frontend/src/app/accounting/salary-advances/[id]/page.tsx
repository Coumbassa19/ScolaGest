import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import AdvanceForm from '@/components/forms/AdvanceForm';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Modifier l’avance',
};

export default async function EditSalaryAdvancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requirePageAuth({ menuKey: 'accounting' });
  const prisma = auth.user.prisma;

  const t = await getTranslations('accounting.salaryAdvances.edit');
  const tc = await getTranslations('accounting.common');
  const { id } = await params;

  const [advance, teachers, staffMembers] = await Promise.all([
    prisma.salaryAdvance.findUnique({ where: { id } }),
    prisma.teacher.findMany({
      select: { id: true, nom: true, prenom: true },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    }),
    prisma.staff.findMany({
      select: { id: true, nom: true, prenom: true, poste: true },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    }),
  ]);

  if (!advance) notFound();

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar
        activeItem="accounting"
        activeSubmenu="accounting-salary-advances"
        expandedMenu="accounting"
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary">
          <Link
            href="/accounting/salary-advances"
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
          <AdvanceForm
            advanceId={advance.id}
            teachers={teachers}
            staff={staffMembers}
            initialData={{
              personType: advance.teacherId ? 'TEACHER' : 'STAFF',
              personId: advance.teacherId ?? advance.staffId ?? '',
              montant: String(advance.montant),
              date: advance.date.toISOString().slice(0, 10),
              motif: advance.motif ?? '',
              periodeAAffecter: advance.periodeAAffecter,
              moyenPaiement: advance.moyenPaiement as 'ESPECES' | 'ORANGE_MONEY' | 'VIREMENT',
            }}
          />
        </div>
      </div>
    </div>
  );
}
