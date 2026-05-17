"use client";

/**
 * Costa Resiliente / Felt-style UI primitives.
 *
 * All components use the light cream surface (#surface) on a dark map canvas.
 * No glass / backdrop-blur. Shadow lifts panels off the map.
 */

import { clsx } from "clsx";
import { forwardRef, type ReactNode, type ButtonHTMLAttributes } from "react";

// ─── Panel ────────────────────────────────────────────────────────────────────
// The foundational light cream card that sits on the dark map.

export function Panel({
  children,
  className,
  shadow = true,
  noPad = false,
  id,
}: {
  children: ReactNode;
  className?: string;
  shadow?: boolean;
  noPad?: boolean;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={clsx(
        "bg-surface border border-border-strong rounded-2xl overflow-hidden",
        shadow && "shadow-panel",
        !noPad && "",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ─── PanelHeader ──────────────────────────────────────────────────────────────

export function PanelHeader({
  children,
  className,
  border = true,
}: {
  children: ReactNode;
  className?: string;
  border?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex items-center gap-2.5 px-4 py-3",
        border && "border-b border-border",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ─── PanelTitle ───────────────────────────────────────────────────────────────

export function PanelTitle({ children }: { children: ReactNode }) {
  return (
    <span className="text-sm font-semibold text-ink tracking-tight flex-1 truncate">
      {children}
    </span>
  );
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────

export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={clsx(
        "text-2xs font-semibold tracking-caps text-ink-muted uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "xs" | "sm" | "md";

const BTN_BASE =
  "inline-flex items-center justify-center gap-1.5 font-medium rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 cursor-pointer disabled:opacity-50 disabled:pointer-events-none";

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-surface hover:bg-accent-hover active:bg-accent-hover",
  secondary:
    "bg-surface-sunken text-ink border border-border hover:bg-surface-hover hover:border-border-strong",
  ghost:
    "text-ink-muted hover:text-ink hover:bg-surface-hover",
  danger:
    "bg-danger text-surface hover:bg-danger-deep active:bg-danger-deep",
};

const BTN_SIZE: Record<ButtonSize, string> = {
  xs: "px-2.5 py-1 text-xs",
  sm: "px-3   py-1.5 text-sm",
  md: "px-4   py-2   text-sm",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  }
>(({ variant = "secondary", size = "sm", className, children, ...rest }, ref) => (
  <button
    ref={ref}
    className={clsx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className)}
    {...rest}
  >
    {children}
  </button>
));
Button.displayName = "Button";

// ─── Pill ─────────────────────────────────────────────────────────────────────
// Read-only status chip.

type PillVariant = "default" | "danger" | "warn" | "ok" | "accent";

const PILL_VARIANT: Record<PillVariant, string> = {
  default: "bg-surface-sunken text-ink-muted",
  danger:  "bg-danger-soft    text-danger-deep",
  warn:    "bg-warn-soft      text-ink-muted",
  ok:      "bg-ok-soft        text-ink",
  accent:  "bg-accent-soft    text-accent",
};

export function Pill({
  children,
  variant = "default",
  className,
}: {
  children: ReactNode;
  variant?: PillVariant;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        PILL_VARIANT[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ─── Badge (number count) ──────────────────────────────────────────────────────

export function Badge({
  count,
  variant = "danger",
}: {
  count: number;
  variant?: "danger" | "warn" | "accent";
}) {
  const BADGE_VARIANT = {
    danger: "bg-danger-deep text-surface",
    warn:   "bg-warn text-surface",
    accent: "bg-accent text-surface",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-2xs font-bold font-mono tabular-nums",
        BADGE_VARIANT[variant],
      )}
    >
      {count > 99 ? "99+" : count > 9 ? "9+" : count}
    </span>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

export function Divider({ className }: { className?: string }) {
  return <div className={clsx("h-px w-full bg-border", className)} aria-hidden="true" />;
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

export function Toggle({
  checked,
  onChange,
  label,
  ariaLabel,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <label className={clsx("flex items-center gap-2.5 cursor-pointer select-none group", disabled && "opacity-50 pointer-events-none")}>
      <span
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel ?? label}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative inline-flex w-[36px] h-[20px] rounded-full transition-colors cursor-pointer shrink-0",
          checked ? "bg-accent" : "bg-surface-sunken border border-border",
        )}
      >
        <span
          className={clsx(
            "absolute top-[2px] w-[16px] h-[16px] rounded-full transition-all duration-150 shadow-sm",
            checked
              ? "left-[18px] bg-surface"
              : "left-[2px] bg-ink-subtle",
          )}
        />
      </span>
      {label && <span className="text-sm text-ink">{label}</span>}
    </label>
  );
}

// ─── PillSegment (time-window selector) ───────────────────────────────────────

export function PillSegmentGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-wrap gap-1", className)}>
      {children}
    </div>
  );
}

export function PillSegment({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "px-2.5 py-1 text-xs font-medium rounded-lg transition-colors",
        active
          ? "bg-ink text-surface-raised"
          : "bg-surface-sunken text-ink-muted border border-border hover:border-border-strong hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

export function EmptyState({
  title,
  body,
  icon,
}: {
  title: string;
  body?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center">
      {icon && (
        <div className="w-10 h-10 rounded-full bg-surface-sunken flex items-center justify-center text-ink-subtle">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {body && <p className="text-xs text-ink-subtle leading-relaxed max-w-[240px]">{body}</p>}
    </div>
  );
}
