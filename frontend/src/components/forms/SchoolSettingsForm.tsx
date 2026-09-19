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
  ministryName: string;
  flagUrl: string | null;
  featuredOnHomepage: boolean;
  homepageLogoUrl: string | null;
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
  const [ministryName, setMinistryName] = useState(initialData.ministryName);
  const [flagUrl, setFlagUrl] = useState(initialData.flagUrl ?? '');
  const [featuredOnHomepage, setFeaturedOnHomepage] = useState(initialData.featuredOnHomepage);
  const [homepageLogoUrl, setHomepageLogoUrl] = useState(initialData.homepageLogoUrl ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const flagInputRef = useRef<HTMLInputElement>(null);
  const homepageLogoInputRef = useRef<HTMLInputElement>(null);

  function resetToInitial() {
    setName(initialData.name);
    setType(initialData.type);
    setAddress(initialData.address);
    setPhone(initialData.phone);
    setEmail(initialData.email);
    setLogoUrl(initialData.logoUrl ?? '');
    setRepubliqueName(initialData.republiqueName);
    setDevise(initialData.devise);
    setMinistryName(initialData.ministryName);
    setFlagUrl(initialData.flagUrl ?? '');
    setFeaturedOnHomepage(initialData.featuredOnHomepage);
    setHomepageLogoUrl(initialData.homepageLogoUrl ?? '');
    setError(null);
    setSaved(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (flagInputRef.current) flagInputRef.current.value = '';
    if (homepageLogoInputRef.current) homepageLogoInputRef.current.value = '';
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

  async function onFlagChange(e: ChangeEvent<HTMLInputElement>) {
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
    setFlagUrl(await readFileAsDataUrl(file));
  }

  function onRemoveFlag() {
    setFlagUrl('');
    setSaved(false);
    if (flagInputRef.current) flagInputRef.current.value = '';
  }

  async function onHomepageLogoChange(e: ChangeEvent<HTMLInputElement>) {
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
    setHomepageLogoUrl(await readFileAsDataUrl(file));
  }

  function onRemoveHomepageLogo() {
    setHomepageLogoUrl('');
    setSaved(false);
    if (homepageLogoInputRef.current) homepageLogoInputRef.current.value = '';
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
      !devise.trim() ||
      !ministryName.trim()
    ) {
      setError(t('errorRequiredFields'));
      return;
    }
    if (featuredOnHomepage && !homepageLogoUrl) {
      setError(t('errorHomepageLogoRequired'));
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
          ministryName: ministryName.trim(),
          flagUrl: flagUrl || null,
          featuredOnHomepage,
          homepageLogoUrl: homepageLogoUrl || null,
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

        {/* Carte d'identité scolaire — everything else on the card (photo,
            nom, classe, matricule…) comes straight from each student's own
            record. */}
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
          <div className="mt-4">
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('ministryNameLabel')}
            </label>
            <input
              type="text"
              required
              value={ministryName}
              onChange={(e) => setMinistryName(e.target.value)}
              className={fieldClass}
            />
            <p className="text-xs text-muted-foreground mt-1">{t('ministryNameHint')}</p>
          </div>

          {/* Drapeau — remplace les 3 bandes du drapeau guinéen par défaut,
              pour une école utilisant ScolaGest dans un autre pays. */}
          <div className="mt-4">
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t('flagLabel')}
            </label>
            <div className="flex items-start gap-4">
              <div className="w-16 h-11 bg-muted rounded-md flex items-center justify-center border-2 border-dashed border-border overflow-hidden flex-shrink-0">
                {flagUrl ? (
                  // data: URL — next/image can't optimize it, a plain <img> is correct here.
                  <img src={flagUrl} alt={t('flagLabel')} className="w-full h-full object-cover" />
                ) : (
                  <Icon i="flag" size={20} className="text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <label className="border-2 border-dashed border-border rounded-md px-3 py-2 text-center cursor-pointer hover:bg-input block">
                  <div className="flex items-center justify-center gap-2">
                    <Icon i="upload" size={16} className="text-primary" />
                    <p className="text-sm font-semibold text-foreground">{t('uploadCta')}</p>
                  </div>
                  <input
                    ref={flagInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={onFlagChange}
                    className="hidden"
                  />
                </label>
                {flagUrl && (
                  <button
                    type="button"
                    onClick={onRemoveFlag}
                    className="self-start text-xs text-danger font-semibold"
                  >
                    {t('removeLogo')}
                  </button>
                )}
                <p className="text-xs text-muted-foreground">{t('flagHint')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Vitrine page d'accueil — indépendant du logo du bulletin ci-dessus.
            Reste caché sur la page publique tant qu'il n'y a pas assez
            d'écoles inscrites (voir t('homepageSectionHint')). */}
        <div className="pt-3 border-t border-border">
          <p className="text-sm font-semibold text-foreground mb-1">{t('homepageSectionTitle')}</p>
          <p className="text-xs text-muted-foreground mb-3">{t('homepageSectionHint')}</p>
          <div className="flex items-start gap-4 mb-4">
            <div className="w-24 h-24 bg-muted rounded-md flex items-center justify-center border-2 border-dashed border-border overflow-hidden flex-shrink-0">
              {homepageLogoUrl ? (
                <img
                  src={homepageLogoUrl}
                  alt={t('logoAlt')}
                  className="w-full h-full object-contain"
                />
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
                  ref={homepageLogoInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={onHomepageLogoChange}
                  className="hidden"
                />
              </label>
              {homepageLogoUrl && (
                <button
                  type="button"
                  onClick={onRemoveHomepageLogo}
                  className="self-start text-xs text-danger font-semibold"
                >
                  {t('removeLogo')}
                </button>
              )}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={featuredOnHomepage}
              onChange={(e) => setFeaturedOnHomepage(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            {t('featuredOnHomepageLabel')}
          </label>
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
