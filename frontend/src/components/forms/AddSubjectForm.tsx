'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export interface TeacherOption {
  id: string;
  nom: string;
  prenom: string;
}

export interface ClassOption {
  id: string;
  name: string;
}

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm placeholder-muted-foreground';

export interface SubjectInitialData {
  nom: string;
  code: string;
  coefficient: string;
  teacherId: string;
  classesText: string; // comma-separated class names
  volumeHoraire: string;
  type: string;
}

export default function AddSubjectForm({
  teachers,
  classes,
  subjectId,
  initialData,
}: {
  teachers: TeacherOption[];
  classes: ClassOption[];
  /** When provided, the form edits this subject (PATCH) instead of creating one (POST). */
  subjectId?: string;
  initialData?: SubjectInitialData;
}) {
  const router = useRouter();
  const t = useTranslations('subjects.form');
  const tCommon = useTranslations('common');
  const { toast } = useToast();
  const isEdit = Boolean(subjectId);
  const [nom, setNom] = useState(initialData?.nom ?? '');
  const [code, setCode] = useState(initialData?.code ?? '');
  const [coefficient, setCoefficient] = useState(initialData?.coefficient ?? '2');
  const [teacherId, setTeacherId] = useState(initialData?.teacherId ?? '');
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(
    () =>
      new Set(
        (initialData?.classesText ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
  );
  const [volumeHoraire, setVolumeHoraire] = useState(initialData?.volumeHoraire ?? '2');
  const [type, setType] = useState(initialData?.type ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleClass(name: string) {
    setSelectedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nom.trim() || !code.trim()) {
      setError(t('errorRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        nom: nom.trim(),
        code: code.trim(),
        coefficient: Number(coefficient) || 1,
        teacherId: teacherId || undefined,
        classesText: [...selectedClasses].join(', ') || undefined,
        volumeHoraire: Number(volumeHoraire) || 1,
        type: type || undefined,
      };
      if (isEdit) {
        await api(`/api/subjects/${subjectId}`, { method: 'PATCH', body });
        toast(tCommon('updatedToast'), 'success');
        router.push(`/subjects/${subjectId}`);
      } else {
        await api('/api/subjects', { method: 'POST', body });
        toast(tCommon('savedToast'), 'success');
        router.push('/subjects');
      }
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('errorNetwork'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl">
      <div className="bg-surface rounded-lg border border-border px-4 py-5 md:px-6 md:py-6 space-y-5">
        {/* Nom de la matière */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            {t('nameLabel')}
          </label>
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder={t('namePlaceholder')}
            required
            className={fieldClass}
          />
        </div>

        {/* Code */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('codeLabel')}
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={t('codePlaceholder')}
              required
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('coefficientLabel')}
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={coefficient}
              onChange={(e) => setCoefficient(e.target.value)}
              placeholder={t('coefficientPlaceholder')}
              className={fieldClass}
            />
          </div>
        </div>

        {/* Enseignant */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            {t('teacherLabel')}
          </label>
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className={fieldClass}
          >
            <option value="">{t('selectTeacherPlaceholder')}</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.nom} {teacher.prenom}
              </option>
            ))}
          </select>
        </div>

        {/* Classes */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            {t('taughtToLabel')}
          </label>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border bg-background px-3 py-3">
            {classes.map((c) => (
              <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedClasses.has(c.name)}
                  onChange={() => toggleClass(c.name)}
                  className="w-4 h-4 border border-border rounded-md bg-background cursor-pointer"
                />
                <span className="text-sm text-foreground">{c.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Volume horaire */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('hoursPerWeekLabel')}
            </label>
            <input
              type="number"
              min={1}
              max={40}
              value={volumeHoraire}
              onChange={(e) => setVolumeHoraire(e.target.value)}
              placeholder={t('hoursPerWeekPlaceholder')}
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('typeLabel')}
            </label>
            <select value={type} onChange={(e) => setType(e.target.value)} className={fieldClass}>
              <option value="">{t('selectPlaceholder')}</option>
              <option value="Fondamentale">{t('typeCore')}</option>
              <option value="Optionnelle">{t('typeOptional')}</option>
            </select>
          </div>
        </div>

        {/* Notes */}
        <div className="p-4 bg-secondary rounded-md">
          <p className="text-xs font-semibold text-foreground">{t('infoTitle')}</p>
          <p className="text-xs text-muted-foreground mt-1">{t('infoBody')}</p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {/* Buttons */}
        <div className="flex gap-3 justify-end pt-4 border-t border-border">
          <Link
            href="/subjects"
            className="px-6 py-2 text-sm font-semibold text-foreground border border-border rounded-md bg-surface"
          >
            {t('cancel')}
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
          >
            {submitting ? t('saving') : isEdit ? t('saveChanges') : t('create')}
          </button>
        </div>
      </div>
    </form>
  );
}
