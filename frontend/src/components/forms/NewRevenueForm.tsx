'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import Icon from '@/components/global/Icon';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export interface StudentOption {
  id: string;
  nom: string;
  prenom: string;
  className: string;
}

const MOTIFS = ['Scolarité', 'Inscription', 'Mensualité', "Frais d'examen", 'Activités'];
const MONTHLY_GOAL = 8_000_000;

function fmt(n: number, locale: string): string {
  return n.toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR');
}

export default function NewRevenueForm({
  students,
  totalMoisAvant,
}: {
  students: StudentOption[];
  totalMoisAvant: number;
}) {
  const t = useTranslations('revenue.new');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const MOYENS: {
    key: 'ORANGE_MONEY' | 'ESPECES';
    label: string;
    sub: string;
    icon: string;
  }[] = [
    {
      key: 'ORANGE_MONEY',
      label: 'Orange Money',
      sub: t('methodMobilePayment'),
      icon: 'smartphone',
    },
    { key: 'ESPECES', label: t('methodCashLabel'), sub: t('methodCash'), icon: 'banknote' },
  ];
  const router = useRouter();
  const { toast } = useToast();
  const [montant, setMontant] = useState('');
  const [moyenPaiement, setMoyenPaiement] = useState<'ORANGE_MONEY' | 'ESPECES'>('ORANGE_MONEY');
  const [studentId, setStudentId] = useState('');
  const [source, setSource] = useState('Scolarité');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStayPrompt, setShowStayPrompt] = useState(false);
  // Tracks totalMoisAvant locally so the impact panel stays correct across a
  // stay-and-add-another loop — each confirmed payment folds into the base
  // that the next one is computed against, instead of showing a stale figure
  // from the page's initial server render.
  const [baseTotal, setBaseTotal] = useState(totalMoisAvant);

  const newAmount = Number(montant) || 0;
  const totalMoisApres = baseTotal + newAmount;
  const pctGoal = Math.min(100, Math.round((totalMoisApres / MONTHLY_GOAL) * 100));

  function resetFormFields() {
    setMontant('');
    setMoyenPaiement('ORANGE_MONEY');
    setStudentId('');
    setSource('Scolarité');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newAmount || newAmount <= 0) {
      setError(t('errorInvalidAmount'));
      return;
    }
    if (!source.trim()) {
      setError(t('errorInvalidMotif'));
      return;
    }
    setSubmitting(true);
    try {
      await api('/api/revenue', {
        method: 'POST',
        body: {
          montant: newAmount,
          source: source.trim(),
          moyenPaiement,
          studentId: studentId || undefined,
        },
      });
      toast(t('savedToast'), 'success');
      setBaseTotal((prev) => prev + newAmount);
      setShowStayPrompt(true);
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('errorNetwork'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function onStayHere() {
    setShowStayPrompt(false);
    resetFormFields();
  }

  function onLeave() {
    router.push('/revenue-received');
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
      {showStayPrompt && (
        <div className="col-span-1 lg:col-span-5 rounded-lg border border-success bg-success/10 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-success">{t('stayPromptQuestion')}</p>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={onStayHere}
              className="px-4 py-1.5 text-sm font-semibold text-primary-foreground bg-primary rounded-md"
            >
              {t('stayPromptYes')}
            </button>
            <button
              type="button"
              onClick={onLeave}
              className="px-4 py-1.5 text-sm font-semibold text-foreground border border-border rounded-md bg-surface"
            >
              {t('stayPromptNo')}
            </button>
          </div>
        </div>
      )}

      {/* LEFT: Form */}
      <div className="col-span-1 lg:col-span-3 space-y-6">
        {/* Amount input */}
        <div className="bg-surface rounded-xl border border-border px-5 py-6 md:px-8 md:py-8">
          <label className="block text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            {t('amountLabel')}
          </label>
          <div className="flex items-end gap-3 mb-2">
            <div className="flex-1 border-b-2 border-primary pb-2 flex items-center">
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                placeholder="0"
                className="w-full bg-transparent text-3xl md:text-5xl font-headings font-semibold text-foreground tracking-tight outline-none"
              />
            </div>
            <span className="text-xl font-semibold text-muted-foreground pb-2">GNF</span>
          </div>
          <p className="text-xs text-muted-foreground">{t('amountHint')}</p>
        </div>

        {/* Moyen de paiement */}
        <div className="bg-surface rounded-xl border border-border px-4 py-5 md:px-6">
          <label className="block text-sm font-semibold text-foreground mb-3">
            {t('paymentMethodLabel')}
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            {MOYENS.map((m) => {
              const active = moyenPaiement === m.key;
              return (
                <button
                  type="button"
                  key={m.key}
                  onClick={() => setMoyenPaiement(m.key)}
                  className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left ${
                    active ? 'border-primary bg-secondary' : 'border-border bg-surface'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${active ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <Icon
                      i={m.icon}
                      size={16}
                      className={active ? 'text-primary-foreground' : 'text-muted-foreground'}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.sub}</p>
                  </div>
                  {active && <Icon i="check-circle" size={18} className="text-primary ml-auto" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Client associé */}
        <div className="bg-surface rounded-xl border border-border px-4 py-5 md:px-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-semibold text-foreground">
              {t('associatedStudentLabel')}
            </label>
            <span className="text-xs text-muted-foreground">{t('optional')}</span>
          </div>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm font-semibold text-foreground mb-3"
          >
            <option value="">{t('noStudentAssociated')}</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom} {s.prenom} — {s.className}
              </option>
            ))}
          </select>
          {students.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {students.slice(0, 6).map((s) => (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => setStudentId(s.id)}
                  className={`px-3 py-1 rounded-full border text-xs font-semibold cursor-pointer ${
                    studentId === s.id
                      ? 'bg-secondary border-primary text-primary'
                      : 'bg-background border-border text-muted-foreground'
                  }`}
                >
                  {s.nom} {s.prenom}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Motif */}
        <div className="bg-surface rounded-xl border border-border px-4 py-5 md:px-6">
          <label className="block text-sm font-semibold text-foreground mb-3">
            {t('motifLabel')}
          </label>
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder={t('motifPlaceholder')}
            className="w-full border border-border rounded-md px-3 py-2 bg-background text-sm text-foreground mb-3"
          />
          <div className="flex flex-wrap gap-2">
            {MOTIFS.map((motif) => (
              <button
                type="button"
                key={motif}
                onClick={() => setSource(motif)}
                className={`px-3 py-1 rounded-full border text-xs font-semibold cursor-pointer ${
                  source === motif
                    ? 'bg-secondary border-primary text-primary'
                    : 'bg-background border-border text-muted-foreground'
                }`}
              >
                {motif}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT: Summary panel */}
      <div className="col-span-1 lg:col-span-2 space-y-4">
        {/* Live total update */}
        <div className="bg-surface rounded-xl border border-border px-4 py-6 md:px-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            {t('impactTitle')}
          </p>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-border">
              <span className="text-sm text-muted-foreground">{t('totalBefore')}</span>
              <span className="text-sm font-semibold text-foreground">
                {fmt(totalMoisAvant, locale)} GNF
              </span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-border">
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <Icon i="plus" size={14} className="text-success" />
                {t('thisPayment')}
              </span>
              <span className="text-sm font-semibold text-success">
                + {fmt(newAmount, locale)} GNF
              </span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-base font-semibold text-foreground">{t('newTotal')}</span>
              <div className="text-right">
                <p className="text-2xl font-headings font-semibold text-primary">
                  {fmt(totalMoisApres, locale)}
                </p>
                <p className="text-xs text-muted-foreground">GNF</p>
              </div>
            </div>
          </div>
        </div>

        {/* Goal progress */}
        <div className="bg-surface rounded-xl border border-border px-4 py-5 md:px-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('monthlyGoal')}
            </p>
            <span className="text-xs font-semibold text-primary">{pctGoal}%</span>
          </div>
          <div className="h-3 bg-muted rounded-full mb-2 overflow-hidden">
            <div className="h-3 bg-primary rounded-full" style={{ width: `${pctGoal}%` }}></div>
          </div>
          <p className="text-xs text-muted-foreground">
            {fmt(totalMoisApres, locale)} / {fmt(MONTHLY_GOAL, locale)} GNF
          </p>
        </div>

        {/* Date */}
        <div className="bg-surface rounded-xl border border-border px-4 py-4 md:px-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase">
                {t('paymentDateLabel')}
              </p>
              <p className="text-sm font-semibold text-foreground mt-1">{t('today')}</p>
            </div>
            <Icon i="calendar" size={18} className="text-muted-foreground" />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        {/* CTA */}
        <button
          type="submit"
          disabled={submitting || showStayPrompt}
          className="w-full py-4 bg-primary text-primary-foreground font-headings font-semibold text-lg rounded-xl flex items-center justify-center gap-3 disabled:opacity-50"
        >
          <Icon i="check-circle" size={22} />
          {submitting ? t('confirming') : t('confirmButton')}
        </button>

        <button
          type="button"
          onClick={() => router.push('/')}
          className="w-full py-3 text-sm font-semibold text-muted-foreground border border-border rounded-xl flex items-center justify-center gap-2 bg-surface"
        >
          <Icon i="x" size={16} />
          {tCommon('cancel')}
        </button>
      </div>
    </form>
  );
}
