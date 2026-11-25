import React from 'react';

export type UserPresenceStatus = 'online' | 'idle' | 'dnd' | 'offline';

interface StatusIndicatorProps {
  status?: UserPresenceStatus | string;
  size?: 'sm' | 'md';
  className?: string;
}

const STATUS_META: Record<UserPresenceStatus, { label: string; colorClass: string }> = {
  online: { label: 'Çevrimiçi', colorClass: 'bg-emerald-500 text-white' },
  idle: { label: 'Boşta', colorClass: 'bg-amber-400 text-slate-950' },
  dnd: { label: 'Rahatsız Etmeyin', colorClass: 'bg-rose-500 text-white' },
  offline: { label: 'Çevrimdışı', colorClass: 'bg-zinc-500 text-white' },
};

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status = 'online',
  size = 'sm',
  className = '',
}) => {
  const normalized: UserPresenceStatus =
    status === 'idle' || status === 'dnd' || status === 'offline' ? status : 'online';
  const meta = STATUS_META[normalized];
  const dims = size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3';

  return (
    <span
      role="status"
      aria-label={meta.label}
      title={meta.label}
      className={`inline-flex items-center justify-center rounded-full ${dims} ${meta.colorClass} relative shrink-0 ${className}`}
    >
      <svg
        viewBox="0 0 12 12"
        className="status-cb-shape w-2.5 h-2.5 hidden"
        aria-hidden="true"
      >
        {normalized === 'online' && <circle cx="6" cy="6" r="3.2" fill="currentColor" />}
        {normalized === 'idle' && (
          <path d="M7.5 2.3A3.8 3.8 0 1 0 9.7 8.5 3.1 3.1 0 1 1 7.5 2.3z" fill="currentColor" />
        )}
        {normalized === 'dnd' && (
          <rect x="2.5" y="5" width="7" height="2" rx="1" fill="currentColor" />
        )}
        {normalized === 'offline' && (
          <circle cx="6" cy="6" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        )}
      </svg>
    </span>
  );
};
