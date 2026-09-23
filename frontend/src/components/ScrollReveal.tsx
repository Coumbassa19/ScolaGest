'use client';

// Fades + slides a block into place the first time it scrolls into view —
// used to give the public homepage's below-the-fold sections some life as
// the visitor scrolls, without pulling in an animation library for what's
// just an IntersectionObserver + a CSS transition. Triggers once (the
// observer disconnects after) so revisiting a section by scrolling back up
// never re-plays it. Respects prefers-reduced-motion by rendering already
// visible, no motion at all.
import { useEffect, useRef, useState, type ReactNode } from 'react';

export default function ScrollReveal({
  children,
  className = '',
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Stagger multiple ScrollReveal siblings by giving each a small offset. */
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
      className={`transition-all duration-700 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      } ${className}`}
    >
      {children}
    </div>
  );
}
