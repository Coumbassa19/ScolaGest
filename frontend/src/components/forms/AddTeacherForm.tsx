'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm placeholder-muted-foreground';

export interface TeacherInitialData {
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  statut: 'TEMPS_PLEIN' | 'VACATAIRE';
  tauxHoraire: string;
}

type StatutValue = 'TEMPS_PLEIN' | 'VACATAIRE';

// Maps the stable `error` codes /api/teachers/[id] can return to the
// matching translation key in `teachers.form`, so a server error always
// reads in the app's current language instead of leaking the raw string
// the route returns. VALIDATION_FAILED isn't mapped: the form already
// validates name client-side, so it falls back to err.message like any
// other unexpected code.
const ERROR_KEYS: Record<string, string> = {
  TEACHER_NOT_FOUND: 'errorTeacherNotFound',
  HOURLY_RATE_REQUIRED: 'errorHourlyRateRequired',
};

export default function AddTeacherForm({
  teacherId,
  initialData,
}: {
  /** When provided, the form edits this teacher (PATCH) instead of creating one (POST). */
  teacherId?: string;
  initialData?: TeacherInitialData;
}) {
  const router = useRouter();
  const t = useTranslations('teachers.form');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const isEdit = Boolean(teacherId);
  const [nom, setNom] = useState(initialData?.nom ?? '');
  const [prenom, setPrenom] = useState(initialData?.prenom ?? '');
  const [email, setEmail] = useState(initialData?.email ?? '');
  const [telephone, setTelephone] = useState(initialData?.telephone ?? '');
  const [statut, setStatut] = useState<StatutValue>(initialData?.statut ?? 'TEMPS_PLEIN');
  const [tauxHoraire, setTauxHoraire] = useState(initialData?.tauxHoraire ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nom.trim() || !prenom.trim()) {
      setError(t('errorNameRequired'));
      return;
    }
    // A VACATAIRE teacher is paid taux horaire × heures réelles de l'emploi
    // du temps — leaving this unset doesn't error at payment time, it
    // silently computes a 0 GNF salary. Caught here instead (mirrored
    // server-side in POST/PATCH /api/teachers).
    if (statut === 'VACATAIRE' && !(tauxHoraire.trim() && Number(tauxHoraire) > 0)) {
      setError(t('errorHourlyRateRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        nom: nom.trim(),
        prenom: prenom.trim(),
        email: email.trim() || undefined,
        telephone: telephone.trim() || undefined,
        statut,
        tauxHoraire: tauxHoraire.trim() ? Number(tauxHoraire) : undefined,
      };
      if (isEdit) {
        await api(`/api/teachers/${teacherId}`, { method: 'PATCH', body });
        toast(tCommon('updatedToast'), 'success');
        router.push(`/teachers/${teacherId}`);
      } else {
        await api('/api/teachers', { method: 'POST', body });
        toast(tCommon('savedToast'), 'success');
        router.push('/teachers');
      }
      router.refresh();
    } catch (err) {
      let message = t('errorNetwork');
      if (err instanceof ApiError) {
        const key = ERROR_KEYS[err.code];
        message = key ? t(key as never) : err.message;
      }
      toast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-6">
      {/* Form Section */}
      <div className="bg-surface rounded-lg border border-border px-6 py-5">
        <div className="mb-4 pb-4 border-b border-border">
          <h2 className="text-lg font-headings font-semibold text-foreground">
            {t('personalInfoTitle')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t('basicDataSubtitle')}</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t('lastNameLabel')}
              </label>
              <input
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder={t('lastNamePlaceholder')}
                required
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t('firstNameLabel')}
              </label>
              <input
                type="text"
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                placeholder={t('firstNamePlaceholder')}
                required
                className={fieldClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t('emailLabel')}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t('phoneLabel')}
              </label>
              <input
                type="tel"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder={t('phonePlaceholder')}
                className={fieldClass}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Pay Section */}
      <div className="bg-surface rounded-lg border border-border px-6 py-5">
        <div className="mb-4 pb-4 border-b border-border">
          <h2 className="text-lg font-headings font-semibold text-foreground">{t('payTitle')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('paySubtitle')}</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t('statutLabel')}
              </label>
              <select
                value={statut}
                onChange={(e) => setStatut(e.target.value as StatutValue)}
                className={fieldClass}
              >
                <option value="TEMPS_PLEIN">{t('statutTempsPlein')}</option>
                <option value="VACATAIRE">{t('statutVacataire')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t('hourlyRateLabel')}
                {statut === 'VACATAIRE' && <span className="text-danger"> *</span>}
              </label>
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={tauxHoraire}
                onChange={(e) => setTauxHoraire(e.target.value)}
                placeholder={t('hourlyRatePlaceholder')}
                required={statut === 'VACATAIRE'}
                className={fieldClass}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {statut === 'VACATAIRE' ? t('hourlyRateHintRequired') : t('hourlyRateHint')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-2 text-sm font-semibold text-foreground border border-border rounded-md bg-surface"
        >
          {t('cancel')}
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
        >
          {submitting ? t('saving') : isEdit ? t('saveChanges') : t('add')}
        </button>
      </div>
    </form>
  );
}
