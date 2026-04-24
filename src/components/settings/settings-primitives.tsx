import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "~/lib/utils";

export function SettingsPanel({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-zinc-200 bg-white p-3.5 shadow-[0_4px_16px_rgba(0,0,0,0.035)]",
        className,
      )}
      {...props}
    />
  );
}

export function SettingsSectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 md:flex-row md:items-start md:justify-between",
        className,
      )}
    >
      <div className="max-w-2xl space-y-1">
        <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-zinc-900 md:text-[22px]">
          {title}
        </h2>
        {description ? (
          <p className="text-[13px] leading-[1.55] text-zinc-500">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function SettingsButton({
  className,
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "destructive";
}) {
  return (
    <button
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-[10px] border px-3 text-[12.5px] font-semibold transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "border-zinc-950 bg-zinc-950 text-white shadow-[0_6px_14px_rgba(0,0,0,0.12)] hover:-translate-y-0.5 hover:bg-black",
        variant === "secondary" &&
          "border-zinc-200 bg-white text-zinc-800 shadow-[0_2px_8px_rgba(0,0,0,0.035)] hover:-translate-y-0.5 hover:bg-zinc-50",
        variant === "destructive" &&
          "border-zinc-950 bg-zinc-950 text-white shadow-[0_6px_14px_rgba(0,0,0,0.12)] hover:-translate-y-0.5 hover:bg-black",
        className,
      )}
      {...props}
    />
  );
}

export function SettingsToggle({
  checked,
  onCheckedChange,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-zinc-300 bg-zinc-200 p-0.5 transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10",
        checked && "bg-zinc-900 border-zinc-900",
        className,
      )}
    >
      <span
        className={cn(
          "block h-[18px] w-[18px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.14)] transition-transform duration-300 ease-out",
          checked ? "translate-x-[18px]" : "translate-x-0",
        )}
      />
    </button>
  );
}

export function SettingsCheckbox({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded-[7px] border border-zinc-300 bg-white text-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all duration-200 ease-out",
        checked && "border-zinc-950 bg-zinc-950",
      )}
    >
      <svg
        viewBox="0 0 12 12"
        className={cn(
          "h-3 w-3 stroke-current stroke-[2.4] transition-opacity duration-200",
          checked ? "opacity-100" : "opacity-0",
        )}
        fill="none"
      >
        <path d="M2.2 6.2 4.8 8.7 9.8 3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function SettingsBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[10.5px] font-semibold text-zinc-700",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SettingsEmptyState({
  icon,
  title,
  description,
  className,
}: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[180px] flex-col items-center justify-center gap-3 px-5 py-8 text-center",
        className,
      )}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-zinc-200 bg-zinc-100 text-zinc-500">
        {icon}
      </div>
      <div className="max-w-md space-y-1">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-zinc-900">
          {title}
        </h3>
        <p className="text-[12.5px] leading-[1.55] text-zinc-500">{description}</p>
      </div>
    </div>
  );
}

export function SettingsSkeleton({
  className,
}: {
  className?: string;
}) {
  return <div className={cn("animate-pulse rounded-[12px] bg-zinc-200/80", className)} />;
}
