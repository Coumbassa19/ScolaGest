import Icon from '@/components/global/Icon';

export interface StatCardProps {
  label?: string;
  value?: string;
  trend?: string;
  trendUp?: boolean;
  icon?: string;
  iconColor?: string;
  iconBg?: string;
}

export default function StatCard({
  label = 'Total Élèves',
  value = '1 248',
  trend = '+12 ce mois',
  trendUp = true,
  icon = 'users',
  iconColor = 'text-primary',
  iconBg = 'bg-secondary',
}: StatCardProps) {
  return (
    <div className="bg-surface rounded-lg border border-border px-4 py-3 md:px-5 md:py-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground font-body">{label}</span>
        <div
          className={`w-8 h-8 ${iconBg} rounded-md flex items-center justify-center ${iconColor} flex-shrink-0`}
        >
          <Icon i={icon} size={15} />
        </div>
      </div>
      <div className="text-2xl md:text-3xl font-headings font-semibold text-foreground">
        {value}
      </div>
      <div className={`text-xs font-semibold ${trendUp ? 'text-success' : 'text-danger'}`}>
        {trend}
      </div>
    </div>
  );
}
