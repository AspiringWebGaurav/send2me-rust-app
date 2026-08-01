import React from 'react';
import { cn } from '../../lib/utils';

export interface StatusIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  status: 'online' | 'offline' | 'pairing' | 'syncing' | 'error';
  pulse?: boolean;
}

export function StatusIndicator({ className, status, pulse = false, ...props }: StatusIndicatorProps) {
  return (
    <div
      className={cn(
        "w-2 h-2 rounded-full shrink-0",
        {
          'bg-success shadow-[0_0_6px_hsl(var(--success)/0.6)]': status === 'online',
          'bg-muted-foreground/40': status === 'offline',
          'bg-warning shadow-[0_0_6px_hsl(var(--warning)/0.6)]': status === 'pairing' || status === 'syncing',
          'bg-danger shadow-[0_0_6px_hsl(var(--danger)/0.6)]': status === 'error',
          'animate-[soft-pulse_2s_ease-in-out_infinite]': pulse,
        },
        className
      )}
      {...props}
    />
  );
}
