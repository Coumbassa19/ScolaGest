import type { Metadata } from 'next';
import { getTranslations, getLocale } from 'next-intl/server';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import BillingPanel from '@/components/billing/BillingPanel';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';
import { prisma } from '@/lib/server/prisma';
import { isSchoolAccessBlocked } from '@/lib/server/tenant/billing-gate';
import { planConfig } from '@/lib/server/billing/constants';
import { formatPrice } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Abonnement',
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; failed?: string }>;
}) {
  // skipBillingGate: true — this is the ONE page a school whose trial/
  // subscription already lapsed must still be able to reach. The normal
  // gate redirects blocked schools HERE; gating this page too would loop.
  const staff = await requirePageAuth({ skipBillingGate: true });
  const t = await getTranslations('billing');
  const locale = await getLocale();
  const sp = await searchParams;

  const school = staff.user.schoolId
    ? await prisma.school.findUnique({
        where: { id: staff.user.schoolId },
        select: { status: true, plan: true, trialEndsAt: true, currentPeriodEnd: true },
      })
    : null;
  const plan = planConfig(school?.plan ?? 'CROISSANCE');

  function fmtDate(d: Date): string {
    return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  const isBlocked = school ? isSchoolAccessBlocked(school) : false;
  const initialBanner = sp.paid ? 'paid' : sp.failed ? 'failed' : null;
  const planName = t(school?.plan === 'ESSENTIEL' ? 'planNameEssentiel' : 'planNameCroissance');
  const priceLabel = `${formatPrice(plan.priceGNF, 'GNF')} / ${locale === 'en' ? 'year' : 'an'}`;

  return (
    <div className="flex flex-col md:flex-row bg-background min-h-full font-body">
      <Sidebar activeItem="settings" />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={t('title')} subtitle={t('subtitle')} />

        <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
          <BillingPanel
            status={school?.status ?? 'TRIALING'}
            isBlocked={isBlocked}
            planName={planName}
            priceLabel={priceLabel}
            trialEndsAtLabel={school?.trialEndsAt ? fmtDate(school.trialEndsAt) : null}
            periodEndLabel={school?.currentPeriodEnd ? fmtDate(school.currentPeriodEnd) : null}
            initialBanner={initialBanner}
          />
        </div>
      </div>
    </div>
  );
}
