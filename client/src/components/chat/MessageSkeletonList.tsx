import React from 'react';

interface MessageSkeletonListProps {
  count?: number;
  compact?: boolean;
}

export const MessageSkeletonList: React.FC<MessageSkeletonListProps> = ({
  count = 3,
  compact = false,
}) => {
  const rows = Array.from({ length: count }, (_, i) => i);
  return (
    <div className={compact ? 'space-y-2 py-2' : 'space-y-3.5 py-3'} aria-hidden="true">
      {rows.map((idx) => (
        <div key={idx} className="flex items-start gap-3 px-2 animate-pulse">
          <div
            className={`${
              compact ? 'w-7 h-7' : 'w-9 h-9'
            } rounded-full bg-white/10 shrink-0`}
          />
          <div className="flex-1 space-y-2 pt-0.5">
            <div className="flex items-center gap-2">
              <div className="h-3 w-24 rounded-full bg-white/15" />
              <div className="h-2.5 w-10 rounded-full bg-white/[0.08]" />
            </div>
            <div
              className={`h-3 rounded-full bg-white/[0.09] ${
                idx % 2 === 0 ? 'w-3/4' : 'w-1/2'
              }`}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
