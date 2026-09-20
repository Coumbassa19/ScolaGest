'use client';

// Public homepage demo-request form (right half of the final CTA section,
// src/app/page.tsx). Submits to /api/demo-requests, which emails the lead
// straight to DEMO_REQUEST_EMAIL — see that route for why a direct send
// (not WhatsApp, not the outbox/queue system) was chosen here.
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import Icon from '@/components/global/Icon';

const fieldClass =
  'w-full border border-border rounded-md px-3 py-2 bg-surface text-foreground text-sm placeholder-muted-foreground';

export default function DemoRequestForm() {
  const t = useTranslations('homepage.demoForm');
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName || !trimmedPhone) {
      setError(t('errorRequired'));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api('/api/demo-requests', {
        method: 'POST',
        body: {
          name: trimmedName,
          phone: trimmedPhone,
          ...(message.trim() ? { message: message.trim() } : {}),
        },
      });
      toast(t('success'), 'success');
      setName('');
      setPhone('');
      setMessage('');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('errorNetwork'), 'error');
    } finally {
      setSubmitting(false);
    }
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

      <div className="flex justify-center">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground font-headings font-semibold text-lg rounded-lg disabled:opacity-50"
        >
          <Icon i="send" size={18} />
          {submitting ? t('submitting') : t('submit')}
        </button>
      </div>
    </form>
  );
}
