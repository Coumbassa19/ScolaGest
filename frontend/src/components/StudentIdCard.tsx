// Presentational student ID card — CR80-ish proportions, styled after the
// reference "carte d'identité scolaire" the school provided: a République
// header (with an optional Ministry line and a school-replaceable flag), a
// boxed title band, and a symmetric body — the photo (left) and the QR code
// (right) are the same size, same vertical position, and same border style,
// with the student's fields in between — plus a coloured school-name footer
// bar. Uses only the data this app already collects (no new Student
// fields). Purely presentational (no data fetching, no hooks) so it can be
// reused by both the single-card preview page and any future list/thumbnail
// view. The PDF twin of this component is src/lib/server/student-card-pdf.ts
// — keep both in sync when tweaking the layout.
import { getTranslations } from 'next-intl/server';
import type { StudentCardData } from '@/lib/server/student-card';
import { formatCardDate, formatAnneeScolaireDisplay, sexeLabel } from '@/lib/student-card-format';
import { computeInitials } from '@/lib/bulletin-format';
import Icon from '@/components/global/Icon';

const ACCENT = '#0B6B3A';

// Photo and QR sit in identically-sized boxes, mirrored left/right — see
// the body layout below. Only the photo gets the accent border; the QR
// side stays border-free so the code itself reads cleanly.
const CARD_BOX = 'w-[92px] h-[116px] rounded-md flex-shrink-0';

// Shrinks the font (never truncates/wraps) so "label value" always fits one
// line — a plain fixed size would either wrap the tail end onto a second
// line with nowhere left to go, or truncate it with "…", losing digits from
// a real phone number. Phone number length/format varies a lot from one
// country to the next (and the school's own number is free text), so this
// is sized off the actual string length rather than assuming one shape.
// This is a Server Component with no canvas to measure real pixel widths
// (see the file header) — character-count thresholds are the low-tech
// equivalent of the PDF twin's true width-based fitFontSize().
function fitTextSizeClass(text: string): string {
  const len = text.length;
  if (len <= 33) return 'text-[11px]';
  if (len <= 42) return 'text-[10px]';
  if (len <= 50) return 'text-[9px]';
  if (len <= 58) return 'text-[8px]';
  return 'text-[7px]';
}

function Field({
  label,
  value,
  bold = true,
  nowrap = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
  // Shrinks to fit and keeps "label value" on one line — for a field whose
  // value is free text of unpredictable length (e.g. a phone number).
  nowrap?: boolean;
}) {
  const sizeClass = nowrap ? fitTextSizeClass(`${label} ${value}`) : 'text-[11px]';
  return (
    <p
      className={`${sizeClass} leading-tight text-foreground ${nowrap ? 'whitespace-nowrap' : ''}`}
    >
      <span className="text-muted-foreground">{label} </span>
      <span className={bold ? 'font-bold' : undefined}>{value}</span>
    </p>
  );
}

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
      <div className="rounded-[6px] p-[3px]" style={{ backgroundColor: ACCENT }}>
        <div className="relative bg-white rounded-[3px] overflow-hidden">
          {/* Security watermark — the school's own logo, large and very
              faint, behind everything; falls back to a faint "ScolaGest"
              mark when no logo is uploaded yet. Purely decorative: never
              placed above readable content (z-0, content is z-10). */}
          <div
            aria-hidden
            className="pointer-events-none select-none absolute inset-0 flex items-center justify-center z-0"
          >
            {data.school.logoUrl ? (
              // data: URL — next/image can't optimize it, a plain <img> is correct here.
              <img
                src={data.school.logoUrl}
                alt=""
                className="w-[70%] h-[70%] object-contain"
                style={{ opacity: 0.1 }}
              />
            ) : (
              <span
                className="text-[42px] font-black uppercase tracking-widest -rotate-[22deg] whitespace-nowrap"
                style={{ color: ACCENT, opacity: 0.06 }}
              >
                ScolaGest
              </span>
            )}
          </div>

          <div className="relative z-10">
            {/* Header */}
            <div className="px-3 pt-2.5 pb-1.5 text-center relative">
              <div className="absolute left-2.5 top-2.5 w-14 h-10 overflow-hidden flex border border-black/10">
                {data.school.flagUrl ? (
                  // data: URL — next/image can't optimize it, a plain <img> is correct here.
                  <img
                    src={data.school.flagUrl}
                    alt={t('flagAlt')}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <>
                    <div className="flex-1" style={{ backgroundColor: '#CE1126' }} />
                    <div className="flex-1" style={{ backgroundColor: '#FCD116' }} />
                    <div className="flex-1" style={{ backgroundColor: '#009460' }} />
                  </>
                )}
              </div>

              {/* Logo — shown whole and undistorted (object-contain, no
                  crop, no circle mask), simply placed. */}
              <div className="absolute right-2.5 top-2.5 w-14 h-10 flex items-center justify-center">
                {data.school.logoUrl ? (
                  // data: URL — next/image can't optimize it, a plain <img> is correct here.
                  <img
                    src={data.school.logoUrl}
                    alt={`Logo ${data.school.name}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div
                    className="w-full h-full rounded-md flex items-center justify-center"
                    style={{ backgroundColor: ACCENT }}
                  >
                    <span className="text-[11px] font-bold text-white">
                      {computeInitials(data.school.name)}
                    </span>
                  </div>
                )}
              </div>

              <p className="text-[12px] font-bold text-foreground uppercase tracking-wide px-16">
                {data.school.republiqueName}
              </p>
              <p className="text-[9px] text-muted-foreground px-16">{data.school.devise}</p>
              <p className="text-[9.5px] italic text-muted-foreground px-16 mt-0.5">
                {data.school.ministryName}
              </p>
            </div>

            {/* Title band */}
            <div className="mx-3 border-t-2 border-b-2 py-1" style={{ borderColor: ACCENT }}>
              <p className="text-[15px] font-bold text-center uppercase" style={{ color: ACCENT }}>
                {t('cardTitle')}
              </p>
            </div>

            {/* Body — photo and QR are twin boxes: same size, same
                position, same border, mirrored left/right. */}
            <div className="flex gap-3 px-3 pt-2.5 pb-2 items-start">
              <div
                className={`${CARD_BOX} border-2 overflow-hidden bg-muted flex items-center justify-center`}
                style={{ borderColor: ACCENT }}
              >
                {data.photoUrl ? (
                  // data: URL — next/image can't optimize it, a plain <img> is correct here.
                  <img
                    src={data.photoUrl}
                    alt={`Photo de ${data.nom} ${data.prenom}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Icon i="user" size={36} className="text-muted-foreground" />
                )}
              </div>

              {/* Fields */}
              <div className="flex-1 min-w-0 space-y-[3px] pt-0.5">
                <Field
                  label={`${t('academicYearLabel')} :`}
                  value={formatAnneeScolaireDisplay(data.anneeScolaire)}
                />
                <Field label={`${t('matriculeLabel')} :`} value={data.matricule} />
                <Field label={`${t('nameLabel')} :`} value={data.nom.toUpperCase()} />
                <Field label={`${t('firstNameLabel')} :`} value={data.prenom} />
                <Field
                  label={`${t('dobLabel')} :`}
                  value={
                    data.dateNaissance
                      ? `${formatCardDate(data.dateNaissance)}${data.lieuNaissance ? ` à ${data.lieuNaissance}` : ''}`
                      : '—'
                  }
                  nowrap
                />
                <div className="flex gap-3">
                  <Field label={`${t('sexLabel')} :`} value={sexeLabel(data.sexe)} />
                  <Field label={`${t('classLabel')} :`} value={data.className} />
                </div>
                <Field label={`${t('lostCardLabel')} :`} value={data.school.phone} nowrap />
              </div>

              <div
                className={`${CARD_BOX} bg-white flex flex-col items-center justify-center gap-1`}
              >
                {/* data: URL — next/image can't optimize it, a plain <img> is correct here. */}
                <img
                  src={qrCodeDataUrl}
                  alt={`QR code ${data.matricule}`}
                  className="w-[72px] h-[72px]"
                />
                <div className="flex items-center gap-0.5">
                  <span style={{ color: ACCENT }}>
                    <Icon i="shield-check" size={9} />
                  </span>
                  <span className="text-[7px] font-semibold text-muted-foreground uppercase">
                    {t('verifiedLabel')}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer — school identity, matching the reference card's
                coloured school-name bar. */}
            <div className="py-1.5 px-2 text-center" style={{ backgroundColor: ACCENT }}>
              <p className="text-[10px] font-bold text-white uppercase truncate">
                {data.school.name}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
