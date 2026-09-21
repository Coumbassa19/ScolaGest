'use client';

// Generic "Modifier / Supprimer" action group for list rows (students,
// teachers, subjects). Delete calls the resource's DELETE endpoint after a
// window.confirm() guard, then router.refresh() to pull the updated list —
// no client-side cache to invalidate since these pages are server components.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

// Maps the stable `error` codes the DELETE endpoints of the various
// resources (classes, cycles, subjects, students, teachers) return to a
// translated message — this component is shared across all of them, so
// codes are grouped by meaning rather than by resource: "no longer exists"
// (a race with another delete) is the same message regardless of resource,
// while "has dependents" and "forbidden" get their own wording since they
// explain a real reason the delete was refused.
const ERROR_KEYS: Record<string, string> = {
  CLASS_NOT_FOUND: 'deleteNotFoundError',
  CYCLE_NOT_FOUND: 'deleteNotFoundError',
  SUBJECT_NOT_FOUND: 'deleteNotFoundError',
  STUDENT_NOT_FOUND: 'deleteNotFoundError',
  TEACHER_NOT_FOUND: 'deleteNotFoundError',
  CLASS_HAS_STUDENTS: 'classHasStudentsError',
  CYCLE_HAS_CLASSES: 'cycleHasClassesError',
  SUBJECT_HAS_GRADES: 'subjectHasGradesError',
  FORBIDDEN: 'forbiddenError',
};

export default function RowActions({
  editHref,
  deleteUrl,
  confirmMessage,
  editLabel,
  deleteLabel,
  editClassName = 'text-accent text-xs font-semibold',
  deleteClassName = 'text-danger text-xs font-semibold disabled:opacity-50',
}: {
  editHref: string;
  deleteUrl: string;
  confirmMessage: string;
  editLabel?: string;
  deleteLabel?: string;
  editClassName?: string;
  deleteClassName?: string;
}) {
  const router = useRouter();
  const t = useTranslations('common');
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    if (!window.confirm(confirmMessage)) return;
    setDeleting(true);
    try {
      await api(deleteUrl, { method: 'DELETE' });
      toast(t('deletedToast'), 'success');
      router.refresh();
    } catch (err) {
      let message = t('networkError');
      if (err instanceof ApiError) {
        const key = ERROR_KEYS[err.code];
        message = key ? t(key as never) : err.message;
      }
      toast(message, 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center justify-center gap-3">
        <Link href={editHref} className={editClassName}>
          {editLabel ?? t('edit')}
        </Link>
        <button type="button" onClick={onDelete} disabled={deleting} className={deleteClassName}>
          {deleting ? '…' : (deleteLabel ?? t('delete'))}
        </button>
      </div>
    </div>
  );
}
