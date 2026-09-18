'use client';

// Reusable password field with a show/hide toggle, shared across the auth
// pages (login/signup/reset-password). Uses the app's <Icon> wrapper instead
// of an inline SVG per project convention.
import { useState } from 'react';
import Icon from '@/components/global/Icon';

export default function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  required = true,
  minLength,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-border rounded-md px-3 py-2 pr-10 bg-background text-foreground text-sm placeholder-muted-foreground"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      >
        <Icon i={visible ? 'eye-off' : 'eye'} size={16} />
      </button>
    </div>
  );
}
