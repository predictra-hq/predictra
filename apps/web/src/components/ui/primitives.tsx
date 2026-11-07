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
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-border-strong bg-bg px-3 text-sm text-fg placeholder:text-subtle",
        "focus:border-positive focus:outline-none",
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
        "h-10 w-full rounded-lg border border-border-strong bg-bg px-3 text-sm text-fg focus:border-positive focus:outline-none",
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

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-[var(--radius-card)] border border-border bg-surface p-5", className)}
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
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
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
