import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from "react";
import { CircleAlert, CircleCheck, Inbox, Info, TriangleAlert } from "lucide-react";
import { TableLabels } from "@/components/ui/table-labels";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-positive text-on-positive hover:bg-positive-strong",
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

// Tendina con la grafica del sito (27/11/2026): stesso uso di un <select>, vedi select.tsx.
export { Select } from "./select";

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
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { scrollLabel?: string }) {
  return (
    <div
      {...(scrollLabel ? { role: "region", "aria-label": scrollLabel, tabIndex: 0 } : {})}
      className={cn(
        "rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5 shadow-[inset_0_1px_0_rgb(255_255_255/0.04),0_1px_2px_rgb(0_0_0/0.4)]",
        scrollLabel && "stack-sm overflow-x-auto",
        className,
      )}
      {...props}
    >
      {scrollLabel ? <TableLabels /> : null}
      {children}
    </div>
  );
}

/** Contenitore a scorrimento orizzontale raggiungibile da tastiera (tabelle larghe). */
export function ScrollRegion({
  label,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { label: string }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn("stack-sm overflow-x-auto", className)}
      {...props}
    >
      <TableLabels />
      {children}
    </div>
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

const toneIcons = {
  neutral: Info,
  positive: CircleCheck,
  negative: CircleAlert,
  warning: TriangleAlert,
} as const;

/** Avviso con icona: il tipo di messaggio si riconosce anche senza il colore. */
export function Alert({
  tone = "neutral",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  const Icon = toneIcons[tone];
  return (
    <div
      role={tone === "negative" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      <Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}

/** Stato vuoto: riquadro tratteggiato con icona, al posto di una riga di testo isolata. */
export function EmptyState({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface/60 px-5 py-10 text-center",
        className,
      )}
    >
      <span className="rounded-full bg-surface-2 p-3 text-muted">
        <Inbox size={22} aria-hidden="true" />
      </span>
      <p className="max-w-md text-sm text-muted">{children}</p>
    </div>
  );
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-4 sm:mb-6 sm:border-b sm:border-border sm:pb-5">
      <h1 className="break-words text-[1.375rem] font-semibold leading-tight tracking-tight sm:text-[1.7rem]">
        {title}
      </h1>
      {description ? (
        <p className="mt-1 hidden max-w-3xl text-sm text-muted sm:block">{description}</p>
      ) : null}
    </header>
  );
}

/**
 * Segnaposto di un riquadro che si sta caricando (dentro `<Suspense>`): la pagina compare
 * subito e ogni sezione arriva quando i suoi dati sono pronti.
 */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "h-36 rounded-[var(--radius-card)] border border-border bg-surface motion-safe:animate-pulse",
        className,
      )}
    />
  );
}
