// Renders a Lucide icon by kebab-case name (as used across the Banani design
// export, e.g. `<Icon i="book-open" />`). Converts to the PascalCase export
// name lucide-react uses (`BookOpen`) and falls back gracefully (renders
// nothing + logs a dev warning) when a name doesn't resolve, rather than
// crashing the page.
import * as LucideIcons from 'lucide-react';
import type { LucideProps } from 'lucide-react';

export interface IconProps {
  i: string;
  size?: number;
  className?: string;
}

function toPascalCase(kebab: string): string {
  return kebab
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

type LucideIconComponent = React.ComponentType<LucideProps>;

export default function Icon({ i, size = 16, className }: IconProps) {
  const componentName = toPascalCase(i);
  const icons = LucideIcons as unknown as Record<string, LucideIconComponent>;
  const LucideIcon = icons[componentName];

  if (!LucideIcon) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[Icon] Unknown lucide-react icon "${i}" (resolved as "${componentName}")`);
    }
    return null;
  }

  return <LucideIcon size={size} className={className} />;
}
