'use client';

// "+ Ajouter un personnel" panel on Comptabilité > Paiement des personnels.
// There is no separate "Gestion du personnel" section (unlike Teacher, which
// has its own add/edit pages) — staff are created directly from this page,
// since the only thing this app tracks about them is who they are and what
// they're paid each month. Posts to /api/staff.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-background text-foreground text-sm';

export default function AddStaffForm() {
  const t = useTranslations('accounting.staffPayments.addForm');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [poste, setPoste] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [salaireMensuel, setSalaireMensuel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setNom('');
    setPrenom('');
    setPoste('');
    setTelephone('');
    setEmail('');
    setSalaireMensuel('');
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!nom.trim() || !prenom.trim() || !poste.trim()) {
      setError(t('errorRequired'));
      return;
    }
    const salaire = Number(salaireMensuel);
    if (!salaire || salaire <= 0) {
      setError(t('errorInvalidSalary'));
      return;
    }

    setSubmitting(true);
    try {
      await api('/api/staff', {
        method: 'POST',
        body: {
          nom: nom.trim(),
          prenom: prenom.trim(),
          poste: poste.trim(),
          ...(telephone.trim() ? { telephone: telephone.trim() } : {}),
          ...(email.trim() ? { email: email.trim() } : {}),
          salaireMensuel: salaire,
        },
      });
      toast(t('savedToast'), 'success');
      resetForm();
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tCommon('networkError'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-4 py-2 border border-border text-foreground text-sm font-semibold rounded-md bg-surface"
      >
        {t('addButton')}
      </button>
    );
  }

  return (
    <div className="bg-surface rounded-lg border border-border px-4 py-5 md:px-6 md:py-6 w-full">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setOpen(false);
          }}
          className="text-xs font-semibold text-muted-foreground"
        >
          {tCommon('close')}
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('nomLabel')}
            </label>
            <input
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              required
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('prenomLabel')}
            </label>
            <input
              type="text"
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
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
              {t('telephoneLabel')}
            </label>
            <input
              type="tel"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('emailLabel')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
            />
          </div>
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

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={() => {
              resetForm();
              setOpen(false);
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
    </div>
  );
}
