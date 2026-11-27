"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Option {
  value: string;
  label: ReactNode;
  text: string;
  disabled: boolean;
}

const textOf = (node: ReactNode): string =>
  typeof node === "string" || typeof node === "number"
    ? String(node)
    : Array.isArray(node)
      ? node.map(textOf).join("")
      : isValidElement<{ children?: ReactNode }>(node)
        ? textOf(node.props.children)
        : "";

/** Le `<option>` passate come figli, anche dentro array e frammenti. */
function optionsOf(children: ReactNode): Option[] {
  const out: Option[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<{ value?: unknown; children?: ReactNode; disabled?: boolean }>(child))
      return;
    if (child.type === "option") {
      const text = textOf(child.props.children);
      out.push({
        value: String(child.props.value ?? text),
        label: child.props.children,
        text,
        disabled: Boolean(child.props.disabled),
      });
    } else if (child.props.children !== undefined) {
      out.push(...optionsOf(child.props.children));
    }
  });
  return out;
}

/**
 * Tendina con la grafica del sito (27/11/2026), al posto di quella del browser. Si usa come un
 * `<select>`: stesse proprietà e figli `<option>`.
 *
 * Dentro resta un `<select>` nativo nascosto: porta il valore nei moduli (anche senza
 * JavaScript) e, alla scelta, lancia l'evento `change` come prima, così i filtri che si
 * aggiornano da soli (`FilterForm`) e gli `onChange` continuano a funzionare.
 *
 * Accessibilità: schema WAI-ARIA «select-only combobox» (pulsante `combobox` con
 * `aria-activedescendant`, lista `listbox`). Tastiera: frecce, Home/Fine, Invio e Spazio,
 * Esc, Tab, e le lettere per saltare all'opzione che inizia così.
 */
export function Select({
  id,
  name,
  defaultValue,
  value,
  onChange,
  required,
  disabled,
  className,
  children,
  form,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = optionsOf(children);
  const firstEnabled = options.find((o) => !o.disabled)?.value ?? "";
  const [own, setOwn] = useState(String(defaultValue ?? firstEnabled));
  const current = value !== undefined ? String(value) : own;
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === current),
  );
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [active, setActive] = useState(selectedIndex);
  const autoId = useId();
  const buttonId = id ?? `select-${autoId}`;
  const listId = `${buttonId}-list`;
  const optionId = (i: number) => `${buttonId}-opt-${i}`;
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const native = useRef<HTMLSelectElement>(null);
  const typed = useRef({ text: "", at: 0 });

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Node && !wrapper.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // optionId dipende solo da buttonId, stabile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  const show = () => {
    if (disabled) return;
    const rect = button.current?.getBoundingClientRect();
    // Si apre verso l'alto se sotto non c'è spazio (barra in basso sul telefono compresa).
    setUp(rect ? window.innerHeight - rect.bottom < 280 && rect.top > 280 : false);
    setActive(selectedIndex);
    setOpen(true);
  };

  const choose = (i: number) => {
    const option = options[i];
    if (!option || option.disabled) return;
    setOpen(false);
    button.current?.focus();
    if (option.value === current) return;
    setOwn(option.value);
    const el = native.current;
    if (el) {
      el.value = option.value;
      // Come la scelta su un <select> vero: React chiama onChange, FilterForm riparte.
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  const move = (from: number, step: number) => {
    let i = from;
    for (let n = 0; n < options.length; n++) {
      i = Math.min(options.length - 1, Math.max(0, i + step));
      if (!options[i]?.disabled) return i;
    }
    return from;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const key = e.key;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (key === "Tab") {
      setOpen(false);
    } else if (key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => move(a, 1));
    } else if (key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => move(a, -1));
    } else if (key === "Home") {
      e.preventDefault();
      setActive(move(-1, 1));
    } else if (key === "End") {
      e.preventDefault();
      setActive(move(options.length, -1));
    } else if (key === "Enter" || key === " ") {
      e.preventDefault();
      choose(active);
    } else if (key.length === 1) {
      const now = e.timeStamp;
      const text = (now - typed.current.at < 600 ? typed.current.text : "") + key.toLowerCase();
      typed.current = { text, at: now };
      const i = options.findIndex((o) => !o.disabled && o.text.toLowerCase().startsWith(text));
      if (i >= 0) setActive(i);
    }
  };

  const selected = options[selectedIndex];

  return (
    <div ref={wrapper} className={cn("relative h-10 w-full", className)}>
      <select
        ref={native}
        name={name}
        form={form}
        required={required}
        disabled={disabled}
        defaultValue={current}
        onChange={onChange}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.text}
          </option>
        ))}
      </select>
      <button
        ref={button}
        id={buttonId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-full w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-input bg-bg px-3 text-left text-sm text-fg transition-colors",
          "hover:border-muted focus:border-positive focus:outline-none focus:ring-2 focus:ring-positive/30",
          "disabled:cursor-not-allowed disabled:opacity-60",
          open && "border-positive ring-2 ring-positive/30",
        )}
      >
        <span className="min-w-0 truncate">{selected?.label}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={cn("shrink-0 text-muted transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={buttonId}
          className={cn(
            "absolute left-0 z-50 max-h-64 min-w-full overflow-y-auto overscroll-contain rounded-xl border border-border-strong bg-surface p-1 shadow-xl",
            up ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={optionId(i)}
              role="option"
              aria-selected={i === selectedIndex}
              aria-disabled={o.disabled || undefined}
              onMouseEnter={() => setActive(i)}
              // Il focus resta sul pulsante: la scelta avviene al clic.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm",
                i === active && "bg-surface-2",
                i === selectedIndex ? "font-medium text-positive-strong" : "text-fg",
                o.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <span>{o.label}</span>
              {i === selectedIndex ? <Check size={14} aria-hidden="true" /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
