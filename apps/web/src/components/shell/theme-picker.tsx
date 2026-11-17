"use client";

import { useState } from "react";
import { THEME_COLOR, THEME_COOKIE, THEMES, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Applica il tema nel browser, senza chiamare il server: cambia `data-theme` su `<html>`,
 * il colore della barra del browser e scrive il cookie. Al caricamento successivo il layout
 * legge il cookie e disegna già il tema giusto (nessun lampo).
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute("content", THEME_COLOR[theme]));
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${ONE_YEAR}; samesite=lax${secure}`;
}

export function ThemePicker({
  initial,
  labels,
}: {
  initial: Theme;
  labels: Readonly<Record<Theme, string>>;
}) {
  const [theme, setTheme] = useState<Theme>(initial);
  return (
    <div className="flex flex-wrap gap-2">
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={theme === t}
          onClick={() => {
            applyTheme(t);
            setTheme(t);
          }}
          className={cn(
            "cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors",
            theme === t
              ? "border-positive/40 bg-positive-soft text-positive-strong"
              : "border-border text-muted hover:text-fg",
          )}
        >
          {labels[t]}
        </button>
      ))}
    </div>
  );
}
