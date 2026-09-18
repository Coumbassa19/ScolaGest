import type { Metadata } from 'next';
import Link from 'next/link';
import QRCode from 'qrcode';
import { getTranslations } from 'next-intl/server';
import Icon from '@/components/global/Icon';
import PrintButton from '@/components/PrintButton';
import StudentIdCard from '@/components/StudentIdCard';
import { getStudentCardData } from '@/lib/server/student-card';
import { requirePageAuth } from '@/lib/server/middleware/require-page-auth';
import { requireSchoolId } from '@/lib/server/tenant/context';

export const metadata: Metadata = {
  title: 'Carte scolaire',
};

export default async function StudentCardPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>;
}) {
  const staff = await requirePageAuth({ menuKey: 'students' });
  const t = await getTranslations('studentCards.detail');
  const tCommon = await getTranslations('common');
  const { studentId } = await searchParams;

  const data = studentId
    ? await getStudentCardData(staff.user.prisma, requireSchoolId(staff.user.schoolId), studentId)
    : null;

  if (!data) {
    return (
      <div className="bg-background min-h-full font-body flex items-center justify-center px-4 py-10">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-headings font-semibold text-foreground">
            {t('studentNotFound')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('selectFromList')}</p>
          <Link
            href="/student-cards"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md"
          >
            {t('backToList')}
          </Link>
        </div>
      </div>
    );
  }

  const qrCodeDataUrl = await QRCode.toDataURL(data.matricule, { margin: 1, width: 200 });

  return (
    <div className="bg-background min-h-full font-body">
      {/* Header with controls */}
      <div className="px-4 py-3 md:px-8 md:py-4 border-b border-border bg-secondary sticky top-0 z-10 flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-headings font-semibold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data.nom} {data.prenom} — {data.className}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <PrintButton />
          <a
            href={`/api/student-card/pdf?studentId=${data.studentId}`}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md"
          >
            <Icon i="download" size={16} />
            {t('download')}
          </a>
          <Link
            href={`/student-cards?classId=${data.classId}`}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-foreground border border-border rounded-md"
          >
            <Icon i="arrow-left" size={16} />
            {tCommon('back')}
          </Link>
        </div>
      </div>

      {/* Card */}
      <div className="max-w-3xl mx-auto px-4 py-10 md:px-8">
        <StudentIdCard data={data} qrCodeDataUrl={qrCodeDataUrl} />
      </div>
    </div>
  );
}
