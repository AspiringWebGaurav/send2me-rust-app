import React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "outline" | "ghost" | "danger";
  size?: "default" | "sm" | "lg" | "icon";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={isLoading || disabled}
        aria-busy={isLoading}
        className={cn(
          "inline-flex items-center justify-center rounded-xl text-sm font-semibold tracking-wide",
          "transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none",
          "active:scale-[0.97] active:transition-none",
          {
            "bg-primary text-primary-foreground shadow-[0_4px_14px_0_hsl(var(--primary)/0.3),inset_0_-1px_0_0_hsl(0_0%_0%/0.1)] hover:shadow-[0_6px_20px_hsl(var(--primary)/0.35),inset_0_-1px_0_0_hsl(0_0%_0%/0.1)] hover:-translate-y-px": variant === "default",
            "bg-secondary text-secondary-foreground shadow-[var(--shadow-e1)] border border-border/50 hover:bg-secondary/80 hover:-translate-y-px hover:shadow-[var(--shadow-e2)]": variant === "secondary",
            "border border-border bg-transparent hover:bg-secondary hover:border-border/80": variant === "outline",
            "hover:bg-secondary/70 hover:text-foreground": variant === "ghost",
            "bg-danger text-white shadow-[0_4px_14px_0_hsl(var(--danger)/0.3)] hover:bg-danger/90 hover:-translate-y-px": variant === "danger",
            "h-10 px-4 py-2": size === "default",
            "h-8 px-3 text-xs rounded-lg": size === "sm",
            "h-11 px-6 text-base rounded-2xl": size === "lg",
            "h-10 w-10 p-0": size === "icon",
          },
          className
        )}
        {...props}
      >
        {isLoading && (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2 shrink-0" />
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
