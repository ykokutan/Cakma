import React from 'react';

interface SkeletonLineProps {
  className?: string;
}

export const SkeletonLine: React.FC<SkeletonLineProps> = ({ className = 'h-3 w-full' }) => (
  <div className={`ui-shimmer rounded-lg bg-white/10 ${className}`} aria-hidden="true" />
);

export const CardSkeleton: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div className="space-y-2.5 p-3.5 rounded-xl bg-black/20 border border-white/5" aria-busy="true">
    <SkeletonLine className="h-3.5 w-2/5" />
    {Array.from({ length: rows }).map((_, i) => (
      <SkeletonLine key={i} className={`h-3 ${i % 2 === 0 ? 'w-full' : 'w-4/5'}`} />
    ))}
  </div>
);

export const MessageListSkeleton: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div className="space-y-3 py-2" aria-busy="true">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full ui-shimmer bg-white/10 shrink-0" />
        <div className="flex-1 space-y-1.5 pt-0.5">
          <SkeletonLine className="h-3 w-28" />
          <SkeletonLine className={`h-3 ${i % 2 === 0 ? 'w-4/5' : 'w-3/5'}`} />
        </div>
      </div>
    ))}
  </div>
);
