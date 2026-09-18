'use client';

// "Informations de l'établissement" on /settings — name/address/contact and
// logo shown on the bulletin (HTML + PDF, see src/lib/bulletin-format.ts and
// src/lib/server/bulletin-pdf.ts). Logo is stored as a data: URL directly on
// the row (no Cloudinary configured yet — same pattern as Student.photoUrl)
// and is PNG/JPEG only, since the PDF export embeds it with pdfkit, which
// can't rasterize SVG.

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Icon from '@/components/global/Icon';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export interface SchoolSettingsData {
  name: string;
  type: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string | null;
  republiqueName: string;
  devise: string;
}

const MAX_LOGO_BYTES = 500_000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const fieldClass = 'w-full border border-border rounded-md px-3 py-2 bg-background text-sm';

export default function SchoolSettingsForm({ initialData }: { initialData: SchoolSettingsData }) {
  const router = useRouter();
  const t = useTranslations('settings.school');
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initialData.name);
  const [type, setType] = useState(initialData.type);
  const [address, setAddress] = useState(initialData.address);
  const [phone, setPhone] = useState(initialData.phone);
  const [email, setEmail] = useState(initialData.email);
  const [logoUrl, setLogoUrl] = useState(initialData.logoUrl ?? '');
  const [republiqueName, setRepubliqueName] = useState(initialData.republiqueName);
  const [devise, setDevise] = useState(initialData.devise);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function resetToInitial() {
    setName(initialData.name);
    setType(initialData.type);
    setAddress(initialData.address);
    setPhone(initialData.phone);
    setEmail(initialData.email);
    setLogoUrl(initialData.logoUrl ?? '');
    setRepubliqueName(initialData.republiqueName);
    setDevise(initialData.devise);
    setError(null);
    setSaved(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function onLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError(t('errorInvalidLogoType'));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(t('errorLogoTooLarge'));
      return;
    }
    setError(null);
    setSaved(false);
    setLogoUrl(await readFileAsDataUrl(file));
  }

  function onRemoveLogo() {
    setLogoUrl('');
    setSaved(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (
      !name.trim() ||
      !address.trim() ||
      !phone.trim() ||
      !email.trim() ||
      !republiqueName.trim() ||
      !devise.trim()
    ) {
      setError(t('errorRequiredFields'));
      return;
    }

    setSubmitting(true);
    try {
      await api('/api/school-settings', {
        method: 'PATCH',
        body: {
          name: name.trim(),
          type: type.trim(),
          address: address.trim(),
          phone: phone.trim(),
          email: email.trim(),
          logoUrl: logoUrl || null,
          republiqueName: republiqueName.trim(),
          devise: devise.trim(),
        },
      });
      setSaved(true);
      toast(t('saved'), 'success');
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('errorNetwork'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface rounded-lg border border-border px-6 py-5">
      <div className="mb-5 pb-5 border-b border-border">
        <h2 className="text-lg font-headings font-semibold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      <div className="space-y-4">
        {/* Logo upload */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-3">
            {t('logoLabel')}
          </label>
          <div className="flex items-start gap-4">
            <div className="w-24 h-24 bg-muted rounded-md flex items-center justify-center border-2 border-dashed border-border overflow-hidden flex-shrink-0">
              {logoUrl ? (
                // data: URL — next/image can't optimize it, a plain <img> is correct here.
                <img src={logoUrl} alt={t('logoAlt')} className="w-full h-full object-contain" />
              ) : (
                <Icon i="image" size={32} className="text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 flex flex-col gap-3">
              <label className="border-2 border-dashed border-border rounded-md px-4 py-4 text-center cursor-pointer hover:bg-input block">
                <div className="flex items-center justify-center gap-2">
                  <Icon i="upload" size={18} className="text-primary" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t('uploadCta')}</p>
                    <p className="text-xs text-muted-foreground">{t('uploadHint')}</p>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={onLogoChange}
                  className="hidden"
                />
              </label>
              {logoUrl && (
                <button
                  type="button"
                  onClick={onRemoveLogo}
                  className="self-start text-xs text-danger font-semibold"
                >
                  {t('removeLogo')}
                </button>
              )}
              <p className="text-xs text-muted-foreground">{t('recommendedDimensions')}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-border">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('nameLabel')}
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('typeLabel')}
            </label>
            <input
              type="text"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('addressLabel')}
            </label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('phoneLabel')}
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            {t('emailLabel')}
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
          />
        </div>

        {/* Carte d'identité scolaire — only these two fields are editable;
            everything else on the card (photo, nom, classe, matricule…)
            comes straight from each student's own record. */}
        <div className="pt-3 border-t border-border">
          <p className="text-sm font-semibold text-foreground mb-1">{t('cardSectionTitle')}</p>
          <p className="text-xs text-muted-foreground mb-3">{t('cardSectionHint')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t('republicNameLabel')}
              </label>
              <input
                type="text"
                required
                value={republiqueName}
                onChange={(e) => setRepubliqueName(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                {t('deviseLabel')}
              </label>
              <input
                type="text"
                required
                value={devise}
                onChange={(e) => setDevise(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {saved && <p className="text-sm text-success">{t('saved')}</p>}

        <div className="flex gap-3 justify-end pt-3">
          <button
            type="button"
            onClick={resetToInitial}
            className="px-4 py-2 text-sm font-semibold text-foreground border border-border rounded-md bg-surface"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-md disabled:opacity-50"
          >
            {submitting ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </form>
  );
}
