// Presentational student ID card — CR80-ish proportions, styled after the
// reference card the school provided. Purely visual (no data fetching, no
// hooks) so it can be reused by both the single-card preview page and any
// future list/thumbnail view. The PDF twin of this component is
// src/lib/server/student-card-pdf.ts — keep both in sync when tweaking the
// layout.
import { getTranslations } from 'next-intl/server';
import type { StudentCardData } from '@/lib/server/student-card';
import { formatCardDate, formatAnneeScolaireDisplay, sexeLabel } from '@/lib/student-card-format';
import { computeInitials } from '@/lib/bulletin-format';
import Icon from '@/components/global/Icon';

const BORDER_COLOR = '#f2a98a';

export default async function StudentIdCard({
  data,
  qrCodeDataUrl,
}: {
  data: StudentCardData;
  qrCodeDataUrl: string;
}) {
  const t = await getTranslations('studentCards.card');
  return (
    <div className="w-full max-w-[420px] mx-auto">
      <div className="rounded-[4px] p-2" style={{ backgroundColor: BORDER_COLOR }}>
        <div className="bg-white rounded-[2px] overflow-hidden">
          {/* Header */}
          <div className="px-3 pt-2.5 pb-2 text-center relative">
            <div className="absolute left-2.5 top-2.5 w-12 h-9 overflow-hidden flex border border-black/10">
              <div className="flex-1" style={{ backgroundColor: '#CE1126' }} />
              <div className="flex-1" style={{ backgroundColor: '#FCD116' }} />
              <div className="flex-1" style={{ backgroundColor: '#009460' }} />
            </div>

            <div className="absolute right-2.5 top-2.5">
              {data.school.logoUrl ? (
                // data: URL — next/image can't optimize it, a plain <img> is correct here.
                <img
                  src={data.school.logoUrl}
                  alt={`Logo ${data.school.name}`}
                  className="w-14 h-14 rounded-full object-cover border border-border"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-sm font-bold text-primary-foreground">
                    {computeInitials(data.school.name)}
                  </span>
                </div>
              )}
            </div>

            <p className="text-[13px] font-bold text-foreground uppercase tracking-wide px-14">
              {data.school.republiqueName}
            </p>
            <p className="text-[10px] text-muted-foreground">{data.school.devise}</p>
            <p className="text-xl font-headings font-bold text-foreground mt-1 uppercase px-14">
              {data.school.name}
            </p>
            <p className="text-sm font-bold text-foreground uppercase">{t('cardTitle')}</p>
          </div>

          <div className="border-t border-border" />

          {/* Body */}
          <div className="flex gap-3.5 px-3 py-3">
            <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <div
                className="w-[112px] h-[140px] rounded-md border-2 overflow-hidden bg-muted flex items-center justify-center"
                style={{ borderColor: BORDER_COLOR }}
              >
                {data.photoUrl ? (
                  // data: URL — next/image can't optimize it, a plain <img> is correct here.
                  <img
                    src={data.photoUrl}
                    alt={`Photo de ${data.nom} ${data.prenom}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Icon i="user" size={44} className="text-muted-foreground" />
                )}
              </div>
              <p className="text-[11px] font-bold text-foreground text-center leading-tight">
                {t('matriculeLabel')} : {data.matricule}
              </p>
            </div>

            <div className="flex-1 min-w-0 space-y-1.5 text-[13px] text-foreground">
              <p>
                <span className="font-bold">{t('academicYearLabel').toUpperCase()} :</span>{' '}
                {formatAnneeScolaireDisplay(data.anneeScolaire)}
              </p>
              <p>
                {t('nameLabel')} : <span className="font-bold">{data.nom.toUpperCase()}</span>
              </p>
              <p>
                {t('firstNameLabel')} : <span className="font-bold">{data.prenom}</span>
              </p>
              <p>
                {t('dobLabel')} :{' '}
                <span className="font-bold">
                  {data.dateNaissance ? formatCardDate(data.dateNaissance) : '—'}
                </span>
              </p>
              <div className="flex gap-4">
                <p>
                  {t('sexLabel')} : <span className="font-bold">{sexeLabel(data.sexe)}</span>
                </p>
                <p>
                  {t('classLabel')} : <span className="font-bold">{data.className}</span>
                </p>
              </div>
              <p>
                {t('contactLabel')} :{' '}
                <span className="font-bold">{data.parentTelephone || '—'}</span>
              </p>
              <div className="flex justify-end pt-1">
                {/* data: URL — next/image can't optimize it, a plain <img> is correct here. */}
                <img src={qrCodeDataUrl} alt={`QR code ${data.matricule}`} className="w-[70px] h-[70px]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
