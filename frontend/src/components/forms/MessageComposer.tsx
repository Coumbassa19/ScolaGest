'use client';

// Composer for the "Messages" feature (src/app/messages/new). Sends to a
// student's parent (one student, a whole class — pick who's absent today,
// the school's stated priority use case — or the whole school) or to a
// teacher (one, or all of them). Email goes out for real through the
// existing Resend pipeline; SMS is shown but disabled until a provider is
// configured (see src/lib/server/sms.ts) — never let the admin believe an
// SMS was sent when it wasn't.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import Icon from '@/components/global/Icon';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import {
  renderMessageTemplate,
  TEMPLATES_BY_AUDIENCE,
  type MessageAudience,
  type MessageTemplateType,
  type MessageLocale,
} from '@/lib/message-templates';

interface ClassLite {
  id: string;
  name: string;
}

interface StudentLite {
  id: string;
  nom: string;
  prenom: string;
  parentEmail: string | null;
  parentTelephone: string | null;
}

interface TeacherLite {
  id: string;
  nom: string;
  prenom: string;
  email: string | null;
  telephone: string | null;
}

type Scope = 'STUDENT' | 'CLASS' | 'SCHOOL' | 'TEACHER' | 'ALL_TEACHERS';
type RecipientType = 'STUDENT_PARENT' | 'TEACHER';
type Channel = 'EMAIL' | 'SMS';

interface SendResult {
  targetId: string;
  targetName: string;
  channel: Channel;
  status: 'SENT' | 'PENDING' | 'FAILED' | 'UNAVAILABLE' | 'SKIPPED';
  reason?: string;
}

const STATUS_CLASS: Record<SendResult['status'], string> = {
  SENT: 'text-success bg-success/10',
  PENDING: 'text-warning bg-warning/10',
  FAILED: 'text-danger bg-danger/10',
  UNAVAILABLE: 'text-muted-foreground bg-muted',
  SKIPPED: 'text-muted-foreground bg-muted',
};

const STATUS_ICON: Record<SendResult['status'], string> = {
  SENT: 'check-circle',
  PENDING: 'clock',
  FAILED: 'x-circle',
  UNAVAILABLE: 'alert-circle',
  SKIPPED: 'alert-circle',
};

const SCOPE_RECIPIENT_TYPE: Record<Scope, RecipientType> = {
  STUDENT: 'STUDENT_PARENT',
  CLASS: 'STUDENT_PARENT',
  SCHOOL: 'STUDENT_PARENT',
  TEACHER: 'TEACHER',
  ALL_TEACHERS: 'TEACHER',
};

const fieldClass = 'w-full border border-border rounded-md px-3 py-2 bg-background text-sm';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateLocalized(iso: string, locale: MessageLocale): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function MessageComposer({
  classes,
  teachers,
  schoolName,
}: {
  classes: ClassLite[];
  teachers: TeacherLite[];
  schoolName: string;
}) {
  const t = useTranslations('messages.composer');
  const tm = useTranslations('messages');
  const locale = useLocale() as MessageLocale;
  const router = useRouter();
  const { toast } = useToast();

  const [scope, setScope] = useState<Scope>('CLASS');
  const recipientType = SCOPE_RECIPIENT_TYPE[scope];
  const audience: MessageAudience = recipientType === 'TEACHER' ? 'TEACHER' : 'PARENT';

  // Student/parent pickers
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [checkedStudentIds, setCheckedStudentIds] = useState<Set<string>>(new Set());
  const [allStudentsCount, setAllStudentsCount] = useState<number | null>(null);

  // Teacher pickers
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(teachers[0]?.id ?? '');

  const [templateType, setTemplateType] = useState<MessageTemplateType>('ABSENCE');
  const [dateIso, setDateIso] = useState(todayIso());
  const [motif, setMotif] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');

  const [channels, setChannels] = useState<Record<Channel, boolean>>({ EMAIL: true, SMS: false });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SendResult[] | null>(null);

  // Keep the template valid for whichever audience is currently selected.
  useEffect(() => {
    const allowed = TEMPLATES_BY_AUDIENCE[audience];
    if (!allowed.includes(templateType)) {
      setTemplateType(allowed[0] as MessageTemplateType);
    }
  }, [audience, templateType]);

  // Load the class roster whenever a class is picked (STUDENT or CLASS scope).
  useEffect(() => {
    if (scope !== 'STUDENT' && scope !== 'CLASS') return;
    if (!classId) return;
    let cancelled = false;
    setLoadingStudents(true);
    api<{ students: StudentLite[] }>(`/api/students?classId=${classId}`)
      .then((res) => {
        if (cancelled) return;
        setStudents(res.students);
        setSelectedStudentId(res.students[0]?.id ?? '');
        setCheckedStudentIds(new Set());
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
  }, [scope, classId]);

  // For SCHOOL scope, just fetch the total student count (for the summary
  // text) — the actual id list is fetched fresh at send time.
  useEffect(() => {
    if (scope !== 'SCHOOL') return;
    let cancelled = false;
    api<{ students: StudentLite[] }>('/api/students').then((res) => {
      if (!cancelled) setAllStudentsCount(res.students.length);
    });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const selectedClass = classes.find((c) => c.id === classId);
  const selectedTeacher = teachers.find((teacher) => teacher.id === selectedTeacherId);

  const previewStudent: StudentLite | undefined =
    scope === 'STUDENT'
      ? students.find((s) => s.id === selectedStudentId)
      : scope === 'CLASS'
        ? students.find((s) => checkedStudentIds.has(s.id))
        : undefined;

  const preview = useMemo(() => {
    const vars =
      audience === 'TEACHER'
        ? {
            professeurNom: selectedTeacher?.nom ?? 'NOM',
            professeurPrenom: selectedTeacher?.prenom ?? 'Prénom',
            ecole: schoolName,
            date: formatDateLocalized(dateIso, locale),
            ...(motif.trim() ? { motif: motif.trim() } : {}),
          }
        : {
            eleveNom: previewStudent?.nom ?? 'NOM',
            elevePrenom: previewStudent?.prenom ?? 'Prénom',
            classe: selectedClass?.name ?? 'Classe',
            ecole: schoolName,
            date: formatDateLocalized(dateIso, locale),
            ...(motif.trim() ? { motif: motif.trim() } : {}),
          };
    return renderMessageTemplate(
      templateType,
      audience,
      vars,
      { subject: customSubject, body: customBody },
      locale,
    );
  }, [
    audience,
    selectedTeacher,
    previewStudent,
    selectedClass,
    schoolName,
    dateIso,
    motif,
    templateType,
    customSubject,
    customBody,
    locale,
  ]);

  function toggleChecked(id: string): void {
    setCheckedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const canSubmit =
    !submitting &&
    (channels.EMAIL || channels.SMS) &&
    (templateType !== 'LIBRE' || customBody.trim().length > 0) &&
    (scope === 'STUDENT'
      ? !!selectedStudentId
      : scope === 'CLASS'
        ? checkedStudentIds.size > 0
        : scope === 'SCHOOL'
          ? (allStudentsCount ?? 0) > 0
          : scope === 'TEACHER'
            ? !!selectedTeacherId
            : teachers.length > 0);

  async function onSubmit(): Promise<void> {
    setError(null);
    setResults(null);
    setSubmitting(true);
    try {
      let targetIds: string[];
      if (scope === 'STUDENT') {
        targetIds = selectedStudentId ? [selectedStudentId] : [];
      } else if (scope === 'CLASS') {
        targetIds = Array.from(checkedStudentIds);
      } else if (scope === 'SCHOOL') {
        const res = await api<{ students: StudentLite[] }>('/api/students');
        targetIds = res.students.map((s) => s.id);
      } else if (scope === 'TEACHER') {
        targetIds = selectedTeacherId ? [selectedTeacherId] : [];
      } else {
        targetIds = teachers.map((teacher) => teacher.id);
      }

      const selectedChannels: Channel[] = (['EMAIL', 'SMS'] as Channel[]).filter(
        (c) => channels[c],
      );

      const res = await api<{ results: SendResult[] }>('/api/messages/send', {
        method: 'POST',
        body: {
          recipientType,
          targetIds,
          channels: selectedChannels,
          templateType,
          date: formatDateLocalized(dateIso, locale),
          locale,
          ...(motif.trim() ? { motif: motif.trim() } : {}),
          ...(templateType === 'LIBRE'
            ? { customSubject: customSubject.trim(), customBody: customBody.trim() }
            : {}),
        },
      });
      setResults(res.results);
      router.refresh();

      const sentCount = res.results.filter((r) => r.status === 'SENT').length;
      const failedCount = res.results.length - sentCount;
      if (failedCount === 0) {
        toast(t('toastAllSent', { count: sentCount }), 'success');
      } else if (sentCount === 0) {
        toast(t('toastAllFailed', { count: failedCount }), 'error');
      } else {
        toast(t('toastPartial', { sent: sentCount, failed: failedCount }), 'info');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('errorNetwork'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
      <div className="space-y-5">
        {/* Étape 1 — Destinataires */}
        <div className="bg-surface rounded-lg border border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">{t('recipientsStepTitle')}</h2>

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {t('parentsLabel')}
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {(
              [
                ['CLASS', t('scopeClass')],
                ['STUDENT', t('scopeStudent')],
                ['SCHOOL', t('scopeSchool')],
              ] as [Scope, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setScope(value)}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold border ${
                  scope === value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-surface text-foreground border-border'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {t('teachersLabel')}
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {(
              [
                ['TEACHER', t('scopeTeacher')],
                ['ALL_TEACHERS', t('scopeAllTeachers')],
              ] as [Scope, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setScope(value)}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold border ${
                  scope === value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-surface text-foreground border-border'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {(scope === 'STUDENT' || scope === 'CLASS') && (
            <div className="mb-3">
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                {t('classLabel')}
              </label>
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className={fieldClass}
              >
                {classes.length === 0 && <option value="">{t('noClasses')}</option>}
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {scope === 'STUDENT' && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                {t('studentLabel')}
              </label>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className={fieldClass}
                disabled={loadingStudents || students.length === 0}
              >
                {students.length === 0 && <option value="">{t('noStudentInClass')}</option>}
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom} {s.prenom}
                  </option>
                ))}
              </select>
            </div>
          )}

          {scope === 'CLASS' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-muted-foreground">
                  {t('studentsToNotify', { count: checkedStudentIds.size })}
                </label>
                {students.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setCheckedStudentIds(
                        checkedStudentIds.size === students.length
                          ? new Set()
                          : new Set(students.map((s) => s.id)),
                      )
                    }
                    className="text-xs font-semibold text-primary"
                  >
                    {checkedStudentIds.size === students.length
                      ? t('deselectAll')
                      : t('selectAll')}
                  </button>
                )}
              </div>
              <div className="border border-border rounded-md max-h-64 overflow-y-auto divide-y divide-border">
                {loadingStudents ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">{t('loading')}</p>
                ) : students.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">
                    {t('noStudentsInClass')}
                  </p>
                ) : (
                  students.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-input"
                    >
                      <input
                        type="checkbox"
                        checked={checkedStudentIds.has(s.id)}
                        onChange={() => toggleChecked(s.id)}
                      />
                      <span className="flex-1 text-foreground">
                        {s.nom} {s.prenom}
                      </span>
                      {!s.parentEmail && !s.parentTelephone && (
                        <span className="text-xs text-warning">{t('noParentContact')}</span>
                      )}
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {scope === 'SCHOOL' && (
            <p className="text-sm text-muted-foreground">
              {allStudentsCount === null
                ? t('schoolScopeLoading')
                : t('schoolScopeText', { count: allStudentsCount })}
            </p>
          )}

          {scope === 'TEACHER' && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                {t('teacherSelectLabel')}
              </label>
              <select
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                className={fieldClass}
                disabled={teachers.length === 0}
              >
                {teachers.length === 0 && <option value="">{t('noTeacherRegistered')}</option>}
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.nom} {teacher.prenom}
                  </option>
                ))}
              </select>
              {selectedTeacher && !selectedTeacher.email && !selectedTeacher.telephone && (
                <p className="text-xs text-warning mt-1">{t('noTeacherContact')}</p>
              )}
            </div>
          )}

          {scope === 'ALL_TEACHERS' && (
            <p className="text-sm text-muted-foreground">
              {t('allTeachersScopeText', { count: teachers.length })}
            </p>
          )}
        </div>

        {/* Étape 2 — Modèle */}
        <div className="bg-surface rounded-lg border border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">{t('templateStepTitle')}</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {TEMPLATES_BY_AUDIENCE[audience].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setTemplateType(type)}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold border ${
                  templateType === type
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-surface text-foreground border-border'
                }`}
              >
                {tm(`templates.${type}`)}
              </button>
            ))}
          </div>

          {templateType === 'ABSENCE' && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                {t('absenceDateLabel')}
              </label>
              <input
                type="date"
                value={dateIso}
                onChange={(e) => setDateIso(e.target.value)}
                className={`${fieldClass} max-w-[200px]`}
              />
            </div>
          )}

          {templateType === 'CONVOCATION' && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                {t('motifLabel')}
              </label>
              <input
                type="text"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder={
                  audience === 'TEACHER'
                    ? t('motifPlaceholderTeacher')
                    : t('motifPlaceholderParent')
                }
                className={fieldClass}
              />
            </div>
          )}

          {templateType === 'LIBRE' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  {t('subjectLabel')}
                </label>
                <input
                  type="text"
                  value={customSubject}
                  onChange={(e) => setCustomSubject(e.target.value)}
                  placeholder={t('subjectPlaceholder', { school: schoolName })}
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  {t('messageLabel')}
                </label>
                <textarea
                  value={customBody}
                  onChange={(e) => setCustomBody(e.target.value)}
                  rows={5}
                  className={fieldClass}
                  placeholder={t('messagePlaceholder')}
                />
              </div>
            </div>
          )}
        </div>

        {/* Étape 3 — Canal */}
        <div className="bg-surface rounded-lg border border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">{t('channelStepTitle')}</h2>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={channels.EMAIL}
                onChange={(e) => setChannels((c) => ({ ...c, EMAIL: e.target.checked }))}
              />
              <Icon i="mail" size={16} className="text-muted-foreground" />
              <span className="text-foreground">{tm('channelEmail')}</span>
            </label>
            <label className="flex items-center gap-3 text-sm opacity-60 cursor-not-allowed">
              <input type="checkbox" checked={false} disabled />
              <Icon i="message-circle" size={16} className="text-muted-foreground" />
              <span className="text-foreground">{tm('channelSms')}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                {t('smsComingSoon')}
              </span>
            </label>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{t('noContactHint')}</p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void onSubmit()}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
        >
          <Icon i="send" size={16} />
          {submitting ? t('sending') : t('sendButton')}
        </button>

        {results && (
          <div className="bg-surface rounded-lg border border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">
              {t('resultTitle', { count: results.length })}
            </h2>
            <div className="divide-y divide-border">
              {results.map((r, i) => (
                <div key={`${r.targetId}-${r.channel}-${i}`} className="flex items-start gap-3 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <span className="text-foreground">
                      {r.targetName || r.targetId} —{' '}
                      {r.channel === 'EMAIL' ? tm('channelEmail') : tm('channelSms')}
                    </span>
                    {r.reason && <p className="text-xs text-muted-foreground mt-0.5">{r.reason}</p>}
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md flex-shrink-0 ${STATUS_CLASS[r.status]}`}
                  >
                    <Icon i={STATUS_ICON[r.status]} size={12} />
                    {tm(`status.${r.status}`)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Aperçu */}
      <div className="bg-surface rounded-lg border border-border px-5 py-4 lg:sticky lg:top-4">
        <h2 className="text-sm font-semibold text-foreground mb-3">{t('previewTitle')}</h2>
        <p className="text-xs text-muted-foreground mb-1">{t('previewSubject')}</p>
        <p className="text-sm font-semibold text-foreground mb-3">{preview.subject}</p>
        <p className="text-xs text-muted-foreground mb-1">{t('previewMessage')}</p>
        <p className="text-sm text-foreground whitespace-pre-line">{preview.body}</p>
      </div>
    </div>
  );
}
