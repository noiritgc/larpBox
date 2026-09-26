import { AlertTriangle, Info, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';

export function StatusBanner({
  tone,
  children,
  icon,
  role = 'status',
}: {
  tone: 'amber' | 'yellow' | 'blue' | 'red' | 'green';
  children: ReactNode;
  icon?: 'offline' | 'warning' | 'info' | 'none';
  role?: 'status' | 'alert';
}) {
  const Icon = icon === 'offline' ? WifiOff : icon === 'warning' ? AlertTriangle : icon === 'info' ? Info : null;
  return (
    <div className={`banner banner-${tone}`} role={role}>
      {Icon ? <Icon size={20} aria-hidden="true" className="mt-[1px] flex-none" /> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
