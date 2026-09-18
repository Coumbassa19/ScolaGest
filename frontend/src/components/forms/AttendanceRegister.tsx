'use client';

// The daily roll-call register: pick a class + date, mark every student's
// status, save. Unmarked students default to PRESENT in the UI (a teacher
// only needs to flag exceptions), but the save always sends every student's
// current status — see the Absence model comment in schema.prisma for why
// a complete daily record beats "only exceptions."
import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import Icon from '@/components/global/Icon';

export interface ClassOption {
  id: string;
  name: string;
}

type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

interface StudentEntry {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  status: Status | null;
  reason: string | null;
}

interface RecentEntry {
  studentId: string;
  studentNom: string;
  studentPrenom: string;
  date: string;
  status: Status;
  reason: string | null;
}

const STATUS_ORDER: Status[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
const STATUS_ICON: Record<Status, string> = {
  PRESENT: 'check-circle',
  ABSENT: 'x-circle',
  LATE: 'clock',
  EXCUSED: 'file-text',
};
const STATUS_COLOR: Record<Status, string> = {
  PRESENT: 'bg-success text-background',
  ABSENT: 'bg-danger text-background',
  LATE: 'bg-warning text-background',
  EXCUSED: 'bg-accent text-accent-foreground',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendanceRegister({ classes }: { classes: ClassOption[] }) {
  const t = useTranslations('absences');
  const { toast } = useToast();

  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [date, setDate] = useState(todayIso());
  const [students, setStudents] = useState<StudentEntry[]>([]);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!classId || !date) return;
    setLoading(true);
    try {
      const res = await api<{ students: StudentEntry[]; recent: RecentEntry[] }>(
        `/api/absences?classId=${classId}&date=${date}`,
      );
      setStudents(res.students);
      setRecent(res.recent);
      const nextStatuses: Record<string, Status> = {};
      const nextReasons: Record<string, string> = {};
      for (const s of res.students) {
        nextStatuses[s.id] = s.status ?? 'PRESENT';
        if (s.reason) nextReasons[s.id] = s.reason;
      }
      setStatuses(nextStatuses);
      setReasons(nextReasons);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('errorNetwork'), 'error');
    } finally {
      setLoading(false);
    }
  }, [classId, date, toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave() {
    if (!classId || !date || students.length === 0) return;
    setSaving(true);
    try {
      await api('/api/absences', {
        method: 'POST',
        body: {
          classId,
          date,
          entries: students.map((s) => ({
            studentId: s.id,
            status: statuses[s.id] ?? 'PRESENT',
            ...(reasons[s.id]?.trim() ? { reason: reasons[s.id]!.trim() } : {}),
          })),
        },
      });
      toast(t('savedToast'), 'success');
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('errorNetwork'), 'error');
    } finally {
      setSaving(false);
    }
  }

  if (classes.length === 0) {
    return (
      <div className="bg-surface rounded-lg border border-border px-5 py-10 text-center text-sm text-muted-foreground">
        {t('noClasses')}
      </div>
    );
  }

  const absentCount = students.filter((s) => statuses[s.id] === 'ABSENT').length;
  const lateCount = students.filter((s) => statuses[s.id] === 'LATE').length;

  return (
    <div className="space-y-6">
      {/* Selectors */}
      <div className="bg-surface rounded-lg border border-border px-5 py-4 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            {t('classLabel')}
          </label>
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            {t('dateLabel')}
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={todayIso()}
            className="w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm"
          />
        </div>
        {students.length > 0 && (
          <div className="text-sm text-muted-foreground whitespace-nowrap">
            {t('summary', { absent: absentCount, late: lateCount })}
          </div>
        )}
      </div>

      {/* Register */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">{t('loading')}</div>
        ) : students.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            {t('noStudents')}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {students.map((s) => {
              const status = statuses[s.id] ?? 'PRESENT';
              return (
                <div key={s.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-foreground">
                      {s.nom} {s.prenom}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">{s.matricule}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {STATUS_ORDER.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setStatuses((prev) => ({ ...prev, [s.id]: opt }))}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold ${
                          status === opt ? STATUS_COLOR[opt] : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        <Icon i={STATUS_ICON[opt]} size={12} />
                        {t(`status.${opt}`)}
                      </button>
                    ))}
                    {(status === 'LATE' || status === 'EXCUSED') && (
                      <input
                        type="text"
                        value={reasons[s.id] ?? ''}
                        onChange={(e) => setReasons((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        placeholder={t('reasonPlaceholder')}
                        className="border border-border rounded-md px-2 py-1.5 bg-background text-foreground text-xs w-full sm:w-40"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {students.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving || loading}
            className="px-6 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
          >
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      )}

      {/* Recent non-present entries */}
      {recent.length > 0 && (
        <div className="bg-surface rounded-lg border border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">{t('recentTitle')}</h2>
          <div className="space-y-2">
            {recent.map((r, i) => (
              <div
                key={`${r.studentId}-${r.date}-${i}`}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="text-foreground">
                  {r.studentNom} {r.studentPrenom}
                </span>
                <span className="text-xs text-muted-foreground">{r.date}</span>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-md ${STATUS_COLOR[r.status]}`}
                >
                  {t(`status.${r.status}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
