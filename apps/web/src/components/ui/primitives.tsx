import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-positive text-black hover:bg-positive-strong",
  secondary: "border border-border-strong bg-surface-2 text-fg hover:bg-border",
  danger: "border border-negative/40 bg-negative-soft text-negative-strong hover:bg-negative/20",
  ghost: "text-muted hover:bg-surface-2 hover:text-fg",
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        "inline-flex h-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-colors",
        "active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0",
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Indicatore di attesa (decorativo: lo stato è annunciato da `aria-busy`). */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-3.5 shrink-0 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin",
        className,
      )}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-input bg-bg px-3 text-sm text-fg transition-colors placeholder:text-subtle",
        "hover:border-muted focus:border-positive focus:outline-none focus:ring-2 focus:ring-positive/30",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full cursor-pointer rounded-lg border border-input bg-bg px-3 text-sm text-fg transition-colors",
        "hover:border-muted focus:border-positive focus:outline-none focus:ring-2 focus:ring-positive/30",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-fg", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/**
 * Con `scrollLabel` la card scorre in orizzontale (tabelle larghe) ed è una regione
 * raggiungibile da tastiera, con un nome per gli screen reader (WCAG 2.1.1).
 */
export function Card({
  className,
  scrollLabel,
  ...props
}: HTMLAttributes<HTMLDivElement> & { scrollLabel?: string }) {
  return (
    <div
      {...(scrollLabel ? { role: "region", "aria-label": scrollLabel, tabIndex: 0 } : {})}
      className={cn(
        "rounded-[var(--radius-card)] border border-border bg-surface p-5",
        scrollLabel && "overflow-x-auto",
        className,
      )}
      {...props}
    />
  );
}

/** Contenitore a scorrimento orizzontale raggiungibile da tastiera (tabelle larghe). */
export function ScrollRegion({
  label,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { label: string }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn("overflow-x-auto", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-base font-semibold text-fg", className)} {...props} />;
}

type Tone = "neutral" | "positive" | "negative" | "warning";

const toneClasses: Record<Tone, string> = {
  neutral: "border-border-strong bg-surface-2 text-muted",
  positive: "border-positive/40 bg-positive-soft text-positive-strong",
  negative: "border-negative/40 bg-negative-soft text-negative-strong",
  warning: "border-warning/40 bg-warning-soft text-warning",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Alert({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return (
    <div
      role={tone === "negative" ? "alert" : "status"}
      className={cn("rounded-lg border px-3 py-2 text-sm", toneClasses[tone], className)}
      {...props}
    />
  );
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p> : null}
    </header>
  );
}
