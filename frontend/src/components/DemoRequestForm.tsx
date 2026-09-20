'use client';

// Public homepage demo-request form (right half of the final CTA section,
// src/app/page.tsx). No backend endpoint on purpose — submitting opens a
// pre-filled WhatsApp conversation on the school's existing WhatsApp number
// (same one already used by the header's WhatsApp button), so a lead never
// depends on an email landing correctly and the founder already lives in
// WhatsApp for this kind of contact.
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import Icon from '@/components/global/Icon';

// Same number as the header's WhatsApp button (src/app/page.tsx).
const WHATSAPP_NUMBER = '224623080950';

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-surface text-foreground text-sm placeholder-muted-foreground';

export default function DemoRequestForm() {
  const t = useTranslations('homepage.demoForm');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName || !trimmedPhone) {
      setError(t('errorRequired'));
      return;
    }
    setError(null);
    const trimmedMessage = message.trim();
    const text = trimmedMessage
      ? t('whatsappTemplateWithMessage', {
          name: trimmedName,
          phone: trimmedPhone,
          message: trimmedMessage,
        })
      : t('whatsappTemplateNoMessage', { name: trimmedName, phone: trimmedPhone });
    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-accent-foreground mb-1.5">
          {t('nameLabel')}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('namePlaceholder')}
          className={fieldClass}
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-accent-foreground mb-1.5">
          {t('phoneLabel')}
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t('phonePlaceholder')}
          className={fieldClass}
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-accent-foreground mb-1.5">
          {t('messageLabel')}
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('messagePlaceholder')}
          rows={3}
          className={fieldClass}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground font-headings font-semibold text-lg rounded-lg"
      >
        <Icon i="send" size={18} />
        {t('submit')}
      </button>
    </form>
  );
}
