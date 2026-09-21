'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export interface ClassOption {
  id: string;
  name: string;
}

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm placeholder-muted-foreground';

// Maps the stable `error` codes /api/students{,/[id]} can return to the
// matching translation key in `students.form`, so a server error always
// reads in the app's current language instead of leaking the raw string
// the route returns. VALIDATION_FAILED isn't mapped: the code is shared
// between a generic "bad request body" case and the specific "invalid date
// of birth" case, and the form already constrains the date field via the
// native date picker, so it falls back to err.message like any other
// unexpected code.
const ERROR_KEYS: Record<string, string> = {
  CLASS_NOT_FOUND: 'errorClassNotFound',
  STUDENT_NOT_FOUND: 'errorStudentNotFound',
  MATRICULE_ALREADY_EXISTS: 'errorMatriculeAlreadyExists',
};

export interface StudentInitialData {
  nom: string;
  prenom: string;
  dateNaissance: string; // "YYYY-MM-DD" or ""
  ville: string;
  quartier: string;
  sexe: 'M' | 'F';
  classId: string;
  anneeScolaire: string;
  matricule: string;
  photoUrl?: string;
  parentNom?: string;
  parentTelephone?: string;
  parentEmail?: string;
}

// No upload provider (Cloudinary) is configured yet, so the photo is stored
// as a data URL directly on the Student row. Capped well under Postgres'
// practical row-size comfort zone — large enough for a small ID photo.
const MAX_PHOTO_BYTES = 500_000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function AddStudentForm({
  classes,
  academicYears,
  studentId,
  initialData,
}: {
  classes: ClassOption[];
  /** Labels, e.g. ["2026-2027", "2025-2026", ...], most recent first. */
  academicYears: string[];
  /** When provided, the form edits this student (PATCH) instead of creating one (POST). */
  studentId?: string;
  initialData?: StudentInitialData;
}) {
  const router = useRouter();
  const t = useTranslations('students.form');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const isEdit = Boolean(studentId);
  const [nom, setNom] = useState(initialData?.nom ?? '');
  const [prenom, setPrenom] = useState(initialData?.prenom ?? '');
  const [dateNaissance, setDateNaissance] = useState(initialData?.dateNaissance ?? '');
  const [ville, setVille] = useState(initialData?.ville ?? '');
  const [quartier, setQuartier] = useState(initialData?.quartier ?? '');
  const [sexe, setSexe] = useState<'M' | 'F'>(initialData?.sexe ?? 'M');
  const [classId, setClassId] = useState(initialData?.classId ?? classes[0]?.id ?? '');
  const [anneeScolaire, setAnneeScolaire] = useState(
    initialData?.anneeScolaire ?? academicYears[0] ?? '2024-2025',
  );
  const [matricule, setMatricule] = useState(initialData?.matricule ?? '');
  const [photoUrl, setPhotoUrl] = useState(initialData?.photoUrl ?? '');
  const [photoFileName, setPhotoFileName] = useState('');
  const [parentNom, setParentNom] = useState(initialData?.parentNom ?? '');
  const [parentTelephone, setParentTelephone] = useState(initialData?.parentTelephone ?? '');
  const [parentEmail, setParentEmail] = useState(initialData?.parentEmail ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('errorInvalidPhotoType'));
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError(t('errorPhotoTooLarge'));
      return;
    }
    setError(null);
    setPhotoFileName(file.name);
    setPhotoUrl(await readFileAsDataUrl(file));
  }

  function onRemovePhoto() {
    setPhotoUrl('');
    setPhotoFileName('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nom.trim() || !prenom.trim()) {
      setError(t('errorNameRequired'));
      return;
    }
    if (!classId) {
      setError(t('errorClassRequired'));
      return;
    }
    if (parentEmail.trim() && !/^\S+@\S+\.\S+$/.test(parentEmail.trim())) {
      setError(t('errorInvalidParentEmail'));
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        nom: nom.trim(),
        prenom: prenom.trim(),
        dateNaissance: dateNaissance || undefined,
        ville: ville.trim() || undefined,
        quartier: quartier.trim() || undefined,
        sexe,
        classId,
        anneeScolaire,
        matricule: matricule.trim() || undefined,
        photoUrl: photoUrl || null,
        parentNom: parentNom.trim() || undefined,
        parentTelephone: parentTelephone.trim() || undefined,
        parentEmail: parentEmail.trim() || undefined,
      };
      if (isEdit) {
        await api(`/api/students/${studentId}`, { method: 'PATCH', body });
        toast(tCommon('updatedToast'), 'success');
        router.push(`/students/${studentId}`);
      } else {
        await api('/api/students', { method: 'POST', body });
        toast(tCommon('savedToast'), 'success');
        router.push('/students');
      }
      router.refresh();
    } catch (err) {
      let message = t('errorNetwork');
      if (err instanceof ApiError) {
        if (err.code === 'PLAN_LIMIT_REACHED') {
          const limit = err.body.limit;
          message = t('errorPlanLimitReached', {
            limit: typeof limit === 'number' ? limit : 0,
          });
        } else {
          const key = ERROR_KEYS[err.code];
          message = key ? t(key as never) : err.message;
        }
      }
      toast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-6">
      {/* Section: Student Details */}
      <div className="bg-surface rounded-lg border border-border px-6 py-5">
        <div className="mb-4 pb-4 border-b border-border">
          <h2 className="text-lg font-headings font-semibold text-foreground">
            {t('studentDetailsTitle')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t('requiredInfo')}</p>
        </div>

        <div className="space-y-4">
          {/* Année scolaire & Matricule */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t('academicYearLabel')}
              </label>
              <select
                value={anneeScolaire}
                onChange={(e) => setAnneeScolaire(e.target.value)}
                className={fieldClass}
              >
                {academicYears.length === 0 && (
                  <option value={anneeScolaire}>{anneeScolaire}</option>
                )}
                {academicYears.map((year) => (
                  <option key={year} value={year}>
                    {year.replace('-', ' - ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t('matriculeLabel')}
              </label>
              <input
                type="text"
                value={matricule}
                onChange={(e) => setMatricule(e.target.value)}
                placeholder={t('matriculePlaceholder')}
                className={fieldClass}
              />
              <p className="text-xs text-muted-foreground mt-1">{t('matriculeHint')}</p>
            </div>
          </div>

          {/* Nom & Prénom */}
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

          {/* Date de naissance & Ville */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t('dobLabel')}
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={dateNaissance}
                  onChange={(e) => setDateNaissance(e.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t('cityLabel')}
              </label>
              <input
                type="text"
                value={ville}
                onChange={(e) => setVille(e.target.value)}
                placeholder={t('cityPlaceholder')}
                className={fieldClass}
              />
            </div>
          </div>

          {/* Quartier & Sexe */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t('districtLabel')}
              </label>
              <input
                type="text"
                value={quartier}
                onChange={(e) => setQuartier(e.target.value)}
                placeholder={t('districtPlaceholder')}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t('sexLabel')}
              </label>
              <select
                value={sexe}
                onChange={(e) => setSexe(e.target.value as 'M' | 'F')}
                className={fieldClass}
              >
                <option value="M">{t('male')}</option>
                <option value="F">{t('female')}</option>
              </select>
            </div>
          </div>

          {/* Classe */}
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('classLabel')}
            </label>
            {classes.length === 0 ? (
              <p className="text-sm text-danger">{t('noClassesError')}</p>
            ) : (
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                required
                className={fieldClass}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Photo — stored as a data URL on the Student row (no Cloudinary
              configured yet; swap this for a real upload once it is). */}
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('photoLabel')}
            </label>
            <div className="border border-border rounded-md px-3 py-2 bg-input flex items-center gap-3">
              {photoUrl && (
                // data: URL — next/image can't optimize it, a plain <img> is correct here.
                <img
                  src={photoUrl}
                  alt={t('photoAlt')}
                  className="w-10 h-10 rounded-md object-cover border border-border flex-shrink-0"
                />
              )}
              <label className="border border-border rounded px-2 py-1 text-xs font-semibold text-foreground bg-surface cursor-pointer hover:bg-input">
                {t('choosePhoto')}
                <input type="file" accept="image/*" onChange={onPhotoChange} className="hidden" />
              </label>
              <span className="text-sm text-muted-foreground truncate">
                {photoFileName || (photoUrl ? t('currentPhoto') : t('noFileChosen'))}
              </span>
              {photoUrl && (
                <button
                  type="button"
                  onClick={onRemovePhoto}
                  className="text-xs text-danger font-semibold ml-auto"
                >
                  {t('removePhoto')}
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t('photoHint')}</p>
          </div>
        </div>
      </div>

      {/* Section: Additional Info — parent/guardian contact */}
      <div className="bg-surface rounded-lg border border-border px-6 py-5">
        <div className="mb-4 pb-4 border-b border-border">
          <h2 className="text-lg font-headings font-semibold text-foreground">
            {t('additionalInfoTitle')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t('parentContactSubtitle')}</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('parentNameLabel')}
            </label>
            <input
              type="text"
              value={parentNom}
              onChange={(e) => setParentNom(e.target.value)}
              placeholder={t('parentNamePlaceholder')}
              className={fieldClass}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t('parentPhoneLabel')}
              </label>
              <input
                type="tel"
                value={parentTelephone}
                onChange={(e) => setParentTelephone(e.target.value)}
                placeholder={t('parentPhonePlaceholder')}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t('parentEmailLabel')}
              </label>
              <input
                type="email"
                value={parentEmail}
                onChange={(e) => setParentEmail(e.target.value)}
                placeholder={t('parentEmailPlaceholder')}
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
          disabled={submitting || classes.length === 0}
          className="px-6 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-md disabled:opacity-50"
        >
          {submitting ? t('saving') : isEdit ? t('saveChanges') : t('save')}
        </button>
      </div>
    </form>
  );
}
