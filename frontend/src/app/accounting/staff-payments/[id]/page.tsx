import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import StaffPaymentForm from '@/components/forms/StaffPaymentForm';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Modifier le paiement',
};

export default async function EditStaffPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const staffAuth = await requirePageAuth({ menuKey: 'accounting' });
  const prisma = staffAuth.user.prisma;

  const t = await getTranslations('accounting.staffPayments.edit');
  const tc = await getTranslations('accounting.common');
  const { id } = await params;

  const [payment, staffMembers] = await Promise.all([
    prisma.staffPayment.findUnique({ where: { id } }),
    prisma.staff.findMany({ orderBy: [{ nom: 'asc' }, { prenom: 'asc' }] }),
  ]);

  if (!payment) notFound();

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar
        activeItem="accounting"
        activeSubmenu="accounting-staff-payments"
        expandedMenu="accounting"
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary">
          <Link
            href="/accounting/staff-payments"
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
          <StaffPaymentForm
            paymentId={payment.id}
            staff={staffMembers.map((s) => ({
              id: s.id,
              nom: s.nom,
              prenom: s.prenom,
              poste: s.poste,
              salaireMensuel: s.salaireMensuel,
            }))}
            initialData={{
              staffId: payment.staffId,
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
