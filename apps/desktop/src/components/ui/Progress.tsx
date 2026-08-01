import React from 'react';
import { cn } from '../../lib/utils';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  variant?: 'default' | 'success' | 'danger' | 'warning';
  indeterminate?: boolean;
}

export function Progress({ className, value, max = 100, variant = 'default', indeterminate, ...props }: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary/60", className)}
      {...props}
    >
      <div
        className={cn(
          "h-full transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] relative overflow-hidden",
          {
            'bg-gradient-to-r from-primary/80 to-primary': variant === 'default',
            'bg-gradient-to-r from-success/80 to-success': variant === 'success',
            'bg-gradient-to-r from-danger/80 to-danger': variant === 'danger',
            'bg-gradient-to-r from-warning/80 to-warning': variant === 'warning',
            'animate-[indeterminate_1.5s_ease-in-out_infinite] w-1/3': indeterminate,
          }
        )}
        style={indeterminate ? undefined : { width: `${percentage}%` }}
      >
        {!indeterminate && (
          <div className="absolute inset-0 w-16 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-[shimmer_2s_linear_infinite]" />
        )}
      </div>
    </div>
  );
}
