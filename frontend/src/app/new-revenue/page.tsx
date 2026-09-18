import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import NewRevenueForm from '@/components/forms/NewRevenueForm';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Enregistrer un paiement',
};

export default async function NewRevenuePage() {
  // No dedicated 'revenue' menu key (see menu-keys.ts) — this is the same
  // accounting/revenue concern as everything under /accounting, so it's
  // gated the same way.
  const staff = await requirePageAuth({ menuKey: 'accounting' });
  const prisma = staff.user.prisma;

  const t = await getTranslations('revenue.new');
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [students, monthPayments] = await Promise.all([
    prisma.student.findMany({
      include: { schoolClass: true },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      take: 100,
    }),
    prisma.revenuePayment.findMany({
      where: { date: { gte: startOfMonth } },
      select: { montant: true },
    }),
  ]);

  const totalMoisAvant = monthPayments.reduce((sum, p) => sum + p.montant, 0);

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar activeItem="revenue" />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-muted-foreground text-sm font-semibold mb-4"
          >
            <Icon i="arrow-left" size={16} />
            {t('backLink')}
          </Link>
          <h1 className="text-2xl md:text-4xl font-headings font-semibold text-foreground">
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>

        <div className="flex-1 px-4 py-5 md:px-8 md:py-8">
          <NewRevenueForm
            students={students.map((s) => ({
              id: s.id,
              nom: s.nom,
              prenom: s.prenom,
              className: s.schoolClass.name,
            }))}
            totalMoisAvant={totalMoisAvant}
          />
        </div>
      </div>
    </div>
  );
}
