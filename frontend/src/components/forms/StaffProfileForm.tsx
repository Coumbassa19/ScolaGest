'use client';

// Full-page create/edit form for a Staff HR record, used by /add-staff and
// /staff/[id] (the "Personnel" section — its own top-level nav item, see
// Sidebar.tsx) — mirrors AddTeacherForm's shape exactly (same isEdit-via-
// optional-id pattern).

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm placeholder-muted-foreground';

export interface StaffInitialData {
  nom: string;
  prenom: string;
  poste: string;
  telephone: string;
  email: string;
  salaireMensuel: string;
}

// Maps the stable `error` codes /api/staff/[id] can return to the matching
// translation key in `staff.form`, so a server error always reads in the
// app's current language instead of leaking the raw string the route
// returns.
const ERROR_KEYS: Record<string, string> = {
  STAFF_NOT_FOUND: 'errorStaffNotFound',
};

export default function StaffProfileForm({
  staffId,
  initialData,
}: {
  /** When provided, the form edits this staff member (PATCH) instead of creating one (POST). */
  staffId?: string;
  initialData?: StaffInitialData;
}) {
  const router = useRouter();
  const t = useTranslations('staff.form');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const isEdit = Boolean(staffId);
  const [nom, setNom] = useState(initialData?.nom ?? '');
  const [prenom, setPrenom] = useState(initialData?.prenom ?? '');
  const [poste, setPoste] = useState(initialData?.poste ?? '');
  const [telephone, setTelephone] = useState(initialData?.telephone ?? '');
  const [email, setEmail] = useState(initialData?.email ?? '');
  const [salaireMensuel, setSalaireMensuel] = useState(initialData?.salaireMensuel ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nom.trim() || !prenom.trim() || !poste.trim()) {
      setError(t('errorNameRequired'));
      return;
    }
    const salaire = Number(salaireMensuel);
    if (!salaire || salaire <= 0) {
      setError(t('errorInvalidSalary'));
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        nom: nom.trim(),
        prenom: prenom.trim(),
        poste: poste.trim(),
        telephone: telephone.trim() || undefined,
        email: email.trim() || undefined,
        salaireMensuel: salaire,
      };
      if (isEdit) {
        await api(`/api/staff/${staffId}`, { method: 'PATCH', body });
        toast(tCommon('updatedToast'), 'success');
        router.push(`/staff/${staffId}`);
      } else {
        await api('/api/staff', { method: 'POST', body });
        toast(tCommon('savedToast'), 'success');
        router.push('/staff');
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
      {/* Personal info */}
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

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('posteLabel')}
            </label>
            <input
              type="text"
              value={poste}
              onChange={(e) => setPoste(e.target.value)}
              placeholder={t('postePlaceholder')}
              required
              className={fieldClass}
            />
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

      {/* Pay */}
      <div className="bg-surface rounded-lg border border-border px-6 py-5">
        <div className="mb-4 pb-4 border-b border-border">
          <h2 className="text-lg font-headings font-semibold text-foreground">{t('payTitle')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('paySubtitle')}</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            {t('salaryLabel')}
          </label>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={salaireMensuel}
            onChange={(e) => setSalaireMensuel(e.target.value)}
            placeholder={t('salaryPlaceholder')}
            required
            className={fieldClass}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

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
