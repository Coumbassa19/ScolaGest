'use client';

// "Compte(s) parent" panel on the student detail page
// (src/app/students/[id]/page.tsx). Lets staff grant a parent/guardian a
// read-only login scoped to this one student (see /parent) — either by
// creating a brand-new account (setup-link email, same flow as staff
// accounts) or by linking an existing parent account already created for a
// sibling, so one login covers every child a family has at the school.

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

const RELATIONS = ['PERE', 'MERE', 'TUTEUR'] as const;
type Relation = (typeof RELATIONS)[number];

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm placeholder-muted-foreground';

export interface ParentLink {
  id: string;
  relation: string;
  createdAt: string;
  parentUser: { id: string; email: string; name: string | null; status: string };
}

interface CreateResponse {
  link: ParentLink;
  emailStatus?: 'SENT' | 'FAILED' | 'UNAVAILABLE';
  emailError?: string;
  setupUrl?: string;
}

interface ParentSearchResult {
  id: string;
  email: string;
  name: string | null;
}

export default function ParentAccountPanel({
  studentId,
  initialLinks,
}: {
  studentId: string;
  initialLinks: ParentLink[];
}) {
  const t = useTranslations('students.detail.parentAccounts');
  const tCommon = useTranslations('common');
  const { toast } = useToast();

  const [links, setLinks] = useState<ParentLink[]>(initialLinks);
  const [formOpen, setFormOpen] = useState(false);
  const [mode, setMode] = useState<'NEW' | 'LINK_EXISTING'>('NEW');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [relation, setRelation] = useState<Relation>('PERE');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ParentSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupResult, setSetupResult] = useState<{ setupUrl: string; email: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function resetForm() {
    setMode('NEW');
    setEmail('');
    setName('');
    setRelation('PERE');
    setQuery('');
    setResults([]);
    setSelectedParentId('');
    setError(null);
  }

  async function runSearch() {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await api<{ parents: ParentSearchResult[] }>(
        `/api/parents/search?q=${encodeURIComponent(query.trim())}`,
      );
      setResults(res.parents);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'LINK_EXISTING' && !selectedParentId) {
      setError(t('errorSelectParent'));
      return;
    }

    setSubmitting(true);
    try {
      const body =
        mode === 'NEW'
          ? {
              mode: 'NEW',
              email: email.trim(),
              ...(name.trim() ? { name: name.trim() } : {}),
              relation,
            }
          : { mode: 'LINK_EXISTING', parentUserId: selectedParentId, relation };
      const res = await api<CreateResponse>(`/api/students/${studentId}/parents`, {
        method: 'POST',
        body,
      });
      setLinks((prev) => [...prev, res.link]);
      if (mode === 'NEW' && res.setupUrl) {
        setSetupResult({ setupUrl: res.setupUrl, email: res.link.parentUser.email });
      } else {
        toast(t('linkedToast'), 'success');
        resetForm();
        setFormOpen(false);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon('networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  async function onUnlink(parentUserId: string) {
    if (!window.confirm(t('unlinkConfirm'))) return;
    try {
      await api(`/api/students/${studentId}/parents/${parentUserId}`, { method: 'DELETE' });
      setLinks((prev) => prev.filter((l) => l.parentUser.id !== parentUserId));
      toast(t('unlinkedToast'), 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('networkError'), 'error');
    }
  }

  return (
    <div className="bg-surface rounded-lg border border-border px-4 py-5 md:px-6 md:py-6 w-full">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
        {!formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="px-3 py-1.5 text-xs font-semibold text-primary-foreground bg-primary rounded-md"
          >
            {t('addButton')}
          </button>
        )}
      </div>

      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noParents')}</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {links.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border border-border"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {l.parentUser.name || l.parentUser.email}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(`relations.${l.relation as Relation}`)} · {l.parentUser.email}
                  {l.parentUser.status === 'SUSPENDED' ? ` · ${t('suspended')}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onUnlink(l.parentUser.id)}
                className="text-xs font-semibold text-danger shrink-0"
              >
                {t('unlink')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {setupResult && (
        <div className="mb-4 px-4 py-4 rounded-md border border-border bg-background">
          <p className="text-sm text-foreground mb-3">
            {t('successEmailSent', { email: setupResult.email })}
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              readOnly
              value={setupResult.setupUrl}
              onClick={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 border border-border rounded-md px-3 py-2 bg-surface text-foreground text-xs font-mono"
            />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(setupResult.setupUrl).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="px-4 py-2 text-sm font-semibold text-foreground border border-border rounded-md bg-surface shrink-0"
            >
              {copied ? t('copied') : t('copyLink')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setSetupResult(null);
              resetForm();
              setFormOpen(false);
            }}
            className="mt-3 text-xs font-semibold text-primary"
          >
            {t('done')}
          </button>
        </div>
      )}

      {formOpen && !setupResult && (
        <form onSubmit={onSubmit} className="space-y-3 border-t border-border pt-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('NEW');
                setError(null);
              }}
              className={`flex-1 px-3 py-2 text-xs font-semibold rounded-md border ${
                mode === 'NEW'
                  ? 'border-primary text-primary bg-primary/10'
                  : 'border-border text-muted-foreground'
              }`}
            >
              {t('modeNew')}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('LINK_EXISTING');
                setError(null);
              }}
              className={`flex-1 px-3 py-2 text-xs font-semibold rounded-md border ${
                mode === 'LINK_EXISTING'
                  ? 'border-primary text-primary bg-primary/10'
                  : 'border-border text-muted-foreground'
              }`}
            >
              {t('modeLinkExisting')}
            </button>
          </div>

          {mode === 'NEW' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  {t('emailLabel')}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  {t('nameLabel')}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                {t('searchLabel')}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className={fieldClass}
                />
                <button
                  type="button"
                  onClick={runSearch}
                  className="px-3 py-2 text-xs font-semibold text-foreground border border-border rounded-md bg-surface shrink-0"
                >
                  {searching ? tCommon('loading') : t('searchButton')}
                </button>
              </div>
              {results.length > 0 && (
                <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {results.map((p) => (
                    <li key={p.id}>
                      <label className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="parentResult"
                          checked={selectedParentId === p.id}
                          onChange={() => setSelectedParentId(p.id)}
                        />
                        <span className="truncate">
                          {p.name || p.email} {p.name ? `— ${p.email}` : ''}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              {t('relationLabel')}
            </label>
            <select
              value={relation}
              onChange={(e) => setRelation(e.target.value as Relation)}
              className={fieldClass}
            >
              {RELATIONS.map((r) => (
                <option key={r} value={r}>
                  {t(`relations.${r}`)}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setFormOpen(false);
              }}
              className="px-4 py-2 text-sm font-semibold text-foreground border border-border rounded-md bg-surface"
            >
              {tCommon('cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
            >
              {submitting ? tCommon('saving') : t('submit')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
