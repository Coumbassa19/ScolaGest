import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import Icon from '@/components/global/Icon';
import ExpenseForm, { type ExpenseCategory } from '@/components/forms/ExpenseForm';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';

export const metadata: Metadata = {
  title: 'Modifier la dépense',
};

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePageAuth({ menuKey: 'accounting' });
  const prisma = staff.user.prisma;

  const t = await getTranslations('accounting.expenses.edit');
  const tc = await getTranslations('accounting.common');
  const { id } = await params;

  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) notFound();

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar
        activeItem="accounting"
        activeSubmenu="accounting-expenses"
        expandedMenu="accounting"
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary">
          <Link
            href="/accounting/expenses"
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
          <ExpenseForm
            expenseId={expense.id}
            initialData={{
              date: expense.date.toISOString().slice(0, 10),
              categorie: expense.categorie as ExpenseCategory,
              description: expense.description,
              montant: String(expense.montant),
              moyenPaiement: expense.moyenPaiement as 'ESPECES' | 'ORANGE_MONEY' | 'VIREMENT',
              beneficiaire: expense.beneficiaire ?? '',
              receiptUrl: expense.receiptUrl ?? '',
            }}
          />
        </div>
      </div>
    </div>
  );
}
