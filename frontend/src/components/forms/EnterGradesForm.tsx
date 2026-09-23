'use client';

import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export interface ClassOption {
  id: string;
  name: string;
  /** Grading scale ("noté sur") of this class's cycle — see Cycles. */
  noteMax: number;
}

export interface SubjectOption {
  id: string;
  nom: string;
  coefficient: number;
}

interface StudentRow {
  id: string;
  nom: string;
  prenom: string;
}

interface GradeRow {
  studentId: string;
  subjectId: string;
  valeur: number;
}

// A locked/validated batch for some (classId, subjectId, periode,
// anneeScolaire) — see GradeSubmission on the server. Only the fields the
// UI needs to render a lock/correction banner.
interface SubmissionRow {
  classId: string;
  subjectId: string;
  periode: string;
  anneeScolaire: string;
  submittedAt: string;
  submittedBy: { name: string | null; email: string } | null;
  correctedAt: string | null;
}

const PERIODE_VALUES = ['T1', 'T2', 'T3'] as const;

const gridCols = { gridTemplateColumns: '2fr 1fr' };

// Same ceiling as the server's GRADE_PROOF_MAX_BYTES (see /api/grades) —
// checked again client-side after resizing so a still-too-large photo is
// caught before the request round-trips.
const MAX_PROOF_BYTES = 900_000;
const MAX_PROOF_WIDTH = 1400;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = dataUrl;
  });
}

// A grade sheet photo needs to stay legible with 30-40 rows of handwriting,
// so it's downscaled (not just capped) rather than rejected outright —
// most phone camera photos are several MB and would never fit otherwise.
async function resizeProofImage(file: File): Promise<string> {
  const original = await readFileAsDataUrl(file);
  const img = await loadImage(original);
  const scale = Math.min(1, MAX_PROOF_WIDTH / img.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const context = canvas.getContext('2d');
  if (!context) return original;
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
}

// Maps the stable `error` codes POST /api/grades can return to the matching
// translation key in `grades.enterForm`, so a server error always reads in
// the app's current language instead of leaking the raw string the route
// returns. VALIDATION_FAILED isn't mapped: the code is shared between a
// generic "bad request body" case and the specific "grade out of range"
// case, and the form already validates the grade range client-side using
// the same noteMax the server checks, so it falls back to err.message like
// any other unexpected code.
const ERROR_KEYS: Record<string, string> = {
  NOT_FOUND: 'errorNotFound',
  FORBIDDEN: 'errorForbidden',
  TEACHER_NOT_LINKED: 'errorTeacherNotLinked',
  PROOF_REQUIRED: 'errorProofRequired',
  GRADES_ALREADY_VALIDATED: 'errorAlreadyValidated',
};

export default function EnterGradesForm({
  classes,
  subjects,
  academicYears,
  role,
}: {
  classes: ClassOption[];
  subjects: SubjectOption[];
  /** Labels, e.g. ["2026-2027", "2025-2026", ...], most recent first. */
  academicYears: string[];
  /** Current account's role — TEACHER is the only role the validation lock applies to. */
  role: string;
}) {
  const t = useTranslations('grades.enterForm');
  const tp = useTranslations('grades.periods');
  const router = useRouter();
  const { toast } = useToast();
  const PERIODES = PERIODE_VALUES.map((value) => ({ value, label: tp(value) }));
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? '');
  const [periode, setPeriode] = useState('T1');
  const [anneeScolaire, setAnneeScolaire] = useState(academicYears[0] ?? '2024-2025');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [proofUrl, setProofUrl] = useState('');
  const [proofFileName, setProofFileName] = useState('');
  const [correctionNote, setCorrectionNote] = useState('');
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!classId) {
      setStudents([]);
      return;
    }
    let cancelled = false;
    setLoadingStudents(true);
    api<{ students: StudentRow[] }>(`/api/students?classId=${classId}`)
      .then((data) => {
        if (!cancelled) setStudents(data.students);
      })
      .catch(() => {
        if (!cancelled) setStudents([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingStudents(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  // Pre-fill existing grades for this class/subject/period so re-opening
  // enter-grades shows what's already saved instead of blank inputs. Also
  // fetches this scope's GradeSubmission rows so the form can lock itself
  // (TEACHER) or show a correction banner (DIRECTION/ADMIN) without a
  // separate round trip — see /api/grades's GET.
  useEffect(() => {
    if (!classId || !subjectId) return;
    let cancelled = false;
    api<{ grades: GradeRow[]; submissions: SubmissionRow[] }>(
      `/api/grades?classId=${classId}&periode=${periode}&anneeScolaire=${anneeScolaire}`,
    )
      .then((data) => {
        if (cancelled) return;
        const forSubject = data.grades.filter((g) => g.subjectId === subjectId);
        const next: Record<string, string> = {};
        for (const g of forSubject) next[g.studentId] = String(g.valeur);
        setNotes(next);
        setSubmissions(data.submissions);
        setProofUrl('');
        setProofFileName('');
        setCorrectionNote('');
      })
      .catch(() => {
        /* best-effort pre-fill only */
      });
    return () => {
      cancelled = true;
    };
  }, [classId, subjectId, periode, anneeScolaire]);

  const teacherOfSubject = subjects.find((s) => s.id === subjectId);
  const selectedClass = classes.find((c) => c.id === classId);
  const noteMax = selectedClass?.noteMax ?? 20;

  const currentSubmission = submissions.find(
    (s) =>
      s.classId === classId &&
      s.subjectId === subjectId &&
      s.periode === periode &&
      s.anneeScolaire === anneeScolaire,
  );
  const isTeacher = role === 'TEACHER';
  // A TEACHER can never re-edit an already-validated batch — see the
  // module header on /api/grades. Any other role (DIRECTION/ADMIN/
  // SUPERADMIN/STAFF-with-access) is the trusted override and stays
  // editable, showing an informational correction banner instead.
  const isLocked = isTeacher && Boolean(currentSubmission);
  const isCorrectionMode = !isTeacher && Boolean(currentSubmission);

  function submissionDate(s: SubmissionRow): string {
    return new Date(s.submittedAt).toLocaleDateString();
  }

  async function onProofChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const resized = await resizeProofImage(file);
      const approxBytes = Math.round((resized.length * 3) / 4);
      if (approxBytes > MAX_PROOF_BYTES) {
        setError(t('errorProofTooLarge'));
        return;
      }
      setProofUrl(resized);
      setProofFileName(file.name);
    } catch {
      setError(t('errorProofTooLarge'));
    }
  }

  function onRemoveProof() {
    setProofUrl('');
    setProofFileName('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (isLocked) return; // form is disabled in this state, but guard anyway
    if (!classId || !subjectId) {
      setError(t('errorSelectRequired'));
      return;
    }
    const entries = students
      .filter((s) => notes[s.id] !== undefined && notes[s.id] !== '')
      .map((s) => ({ studentId: s.id, valeur: Number(notes[s.id]) }));

    if (entries.length === 0) {
      setError(t('errorAtLeastOneGrade'));
      return;
    }
    if (entries.some((e) => Number.isNaN(e.valeur) || e.valeur < 0 || e.valeur > noteMax)) {
      setError(t('errorGradeRange', { max: noteMax }));
      return;
    }
    if (isTeacher && !proofUrl) {
      setError(t('errorProofRequired'));
      return;
    }

    setSubmitting(true);
    try {
      await api('/api/grades', {
        method: 'POST',
        body: {
          classId,
          subjectId,
          periode,
          anneeScolaire,
          entries,
          ...(proofUrl ? { proofUrl } : {}),
          ...(isCorrectionMode && correctionNote.trim()
            ? { correctionNote: correctionNote.trim() }
            : {}),
        },
      });
      setSuccess(true);
      toast(t('success'), 'success');
      const params = new URLSearchParams({ classId, periode, anneeScolaire });
      router.push(`/grades?${params.toString()}`);
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
    <form onSubmit={onSubmit}>
      {/* Filters */}
      <div className="px-4 py-4 md:px-8 border-b border-border bg-surface space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              {t('classLabel')}
            </label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm text-foreground"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              {t('subjectLabel')}
            </label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm text-foreground"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              {t('periodLabel')}
            </label>
            <select
              value={periode}
              onChange={(e) => setPeriode(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm text-foreground"
            >
              {PERIODES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5">
              {t('yearLabel')}
            </label>
            <select
              value={anneeScolaire}
              onChange={(e) => setAnneeScolaire(e.target.value)}
              className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm text-foreground"
            >
              {academicYears.length === 0 && <option value={anneeScolaire}>{anneeScolaire}</option>}
              {academicYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="text-xs text-muted-foreground bg-secondary rounded-md px-3 py-2">
          {t('hint', {
            max: noteMax,
            coeff: teacherOfSubject ? t('hintCoeff', { value: teacherOfSubject.coefficient }) : '',
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
        {isLocked && currentSubmission && (
          <div className="mb-4 rounded-lg border border-danger bg-danger/10 px-4 py-3">
            <p className="text-sm font-semibold text-danger">{t('lockedTitle')}</p>
            <p className="text-sm text-danger mt-1">
              {currentSubmission.submittedBy
                ? t('lockedMessage', {
                    date: submissionDate(currentSubmission),
                    name: currentSubmission.submittedBy.name || currentSubmission.submittedBy.email,
                  })
                : t('lockedMessageUnknownSubmitter', { date: submissionDate(currentSubmission) })}
            </p>
          </div>
        )}
        {isCorrectionMode && currentSubmission && (
          <div className="mb-4 rounded-lg border border-warning bg-warning/10 px-4 py-3">
            <p className="text-sm text-warning">
              {currentSubmission.submittedBy
                ? t('correctionBanner', {
                    date: submissionDate(currentSubmission),
                    name: currentSubmission.submittedBy.name || currentSubmission.submittedBy.email,
                  })
                : t('correctionBannerUnknownSubmitter', {
                    date: submissionDate(currentSubmission),
                  })}
            </p>
          </div>
        )}

        <div className="bg-surface rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: '360px' }}>
              {/* Table header */}
              <div className="grid px-5 py-3 bg-muted border-b border-border" style={gridCols}>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('headerStudent')}
                </span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">
                  {t('headerGrade', { max: noteMax })}
                </span>
              </div>

              {/* Rows */}
              <div>
                {loadingStudents ? (
                  <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                    {t('loadingStudents')}
                  </div>
                ) : students.length === 0 ? (
                  <div className="px-5 py-6 text-sm text-muted-foreground text-center">
                    {t('noStudentsInClass')}
                  </div>
                ) : (
                  students.map((s) => (
                    <div
                      key={s.id}
                      className="grid px-5 py-3 border-b border-border items-center"
                      style={gridCols}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {s.nom} {s.prenom}
                        </span>
                      </div>
                      <div className="text-center">
                        <input
                          type="number"
                          min={0}
                          max={noteMax}
                          step={0.1}
                          placeholder="—"
                          value={notes[s.id] ?? ''}
                          onChange={(e) =>
                            setNotes((prev) => ({ ...prev, [s.id]: e.target.value }))
                          }
                          disabled={isLocked}
                          className="w-20 text-center border border-border rounded-md px-2 py-1.5 bg-background text-sm font-semibold text-foreground placeholder-muted-foreground disabled:opacity-60"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {!isLocked && (
          <div className="mt-4">
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('proofLabel')}
            </label>
            <div className="border border-border rounded-md px-3 py-2 bg-input flex items-center gap-3">
              {proofUrl && (
                // data: URL — next/image can't optimize it, a plain <img> is correct here.
                <img
                  src={proofUrl}
                  alt={t('proofAlt')}
                  className="w-10 h-10 rounded-md object-cover border border-border flex-shrink-0"
                />
              )}
              <label className="px-3 py-1.5 text-xs font-semibold text-foreground border border-border rounded-md bg-surface cursor-pointer shrink-0">
                {t('proofChooseFile')}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => void onProofChange(e)}
                  className="hidden"
                />
              </label>
              <span className="text-sm text-muted-foreground truncate">
                {proofFileName || (proofUrl ? t('proofCurrent') : t('proofNoFileChosen'))}
              </span>
              {proofUrl && (
                <button
                  type="button"
                  onClick={onRemoveProof}
                  className="text-xs font-semibold text-danger shrink-0 ml-auto"
                >
                  {t('proofRemove')}
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {isTeacher ? t('proofHintRequired') : t('proofHintOptional')}
            </p>
          </div>
        )}

        {isCorrectionMode && (
          <div className="mt-4">
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('correctionNoteLabel')}
            </label>
            <textarea
              value={correctionNote}
              onChange={(e) => setCorrectionNote(e.target.value)}
              placeholder={t('correctionNotePlaceholder')}
              rows={2}
              className="w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm placeholder-muted-foreground"
            />
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger mt-4">
            {error}
          </p>
        )}
        {success && <p className="text-sm text-success mt-4">{t('success')}</p>}

        {/* Action buttons */}
        <div className="flex gap-3 justify-end mt-6">
          <Link
            href="/grades"
            className="px-6 py-2 text-sm font-semibold text-foreground border border-border rounded-md bg-surface"
          >
            {t('back')}
          </Link>
          {!isLocked && (
            <button
              type="submit"
              disabled={submitting || students.length === 0}
              className="px-6 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
            >
              {submitting ? t('saving') : t('save')}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
