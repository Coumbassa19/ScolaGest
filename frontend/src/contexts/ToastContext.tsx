'use client';

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import Icon from '@/components/global/Icon';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  entering?: boolean;
  exiting?: boolean;
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (message: string, type?: ToastType) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  toast: () => {},
  dismiss: () => {},
});

const TOAST_DURATION = 4000;
const FADE_OUT_DURATION = 250;

const TOAST_STYLES: Record<ToastType, { icon: string; classes: string; iconClass: string }> = {
  success: {
    icon: 'check-circle',
    classes: 'border-success/25 bg-success-bg text-success',
    iconClass: 'text-success',
  },
  error: {
    icon: 'alert-circle',
    classes: 'border-danger/25 bg-danger-bg text-danger',
    iconClass: 'text-danger',
  },
  info: {
    icon: 'info',
    classes: 'border-border bg-surface text-foreground',
    iconClass: 'text-muted-foreground',
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, FADE_OUT_DURATION);
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = 'success') => {
      const id = nextIdRef.current++;
      setToasts((prev) => [...prev, { id, message, type, entering: true }]);
      // Drop the "entering" flag on the next tick so the transition actually
      // animates in (mounting already-settled classes skips the transition).
      requestAnimationFrame(() => {
        setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, entering: false } : t)));
      });
      setTimeout(() => dismiss(id), TOAST_DURATION);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toasts, toast: addToast, dismiss }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed top-0 left-0 right-0 z-[100] flex flex-col items-center gap-2 px-4 pt-4"
      >
        {toasts.map((t) => {
          const style = TOAST_STYLES[t.type];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg transition-all duration-300 ${style.classes} ${
                t.entering || t.exiting
                  ? 'opacity-0 -translate-y-1.5'
                  : 'opacity-100 translate-y-0'
              }`}
              style={{ maxWidth: '90vw', width: '26rem' }}
            >
              <Icon i={style.icon} size={18} className={`flex-shrink-0 mt-0.5 ${style.iconClass}`} />
              <span className="flex-1 leading-snug">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="flex-shrink-0 opacity-60 hover:opacity-100"
                aria-label="×"
              >
                <Icon i="x" size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
