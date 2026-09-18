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
}

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nom.trim() || !prenom.trim()) {
      setError(t('errorNameRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        nom: nom.trim(),
        prenom: prenom.trim(),
        email: email.trim() || undefined,
        telephone: telephone.trim() || undefined,
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
      toast(err instanceof ApiError ? err.message : t('errorNetwork'), 'error');
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
