/** Tema dell'interfaccia: scuro (predefinito) o chiaro. I colori sono in `app/globals.css`. */
export const THEMES = ["dark", "light"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_COOKIE = "predictra-theme";

/** Colore della barra del browser per ogni tema: uguale a `--color-bg`. */
export const THEME_COLOR: Readonly<Record<Theme, string>> = {
  dark: "#0a0b0d",
  light: "#f6f7f9",
};

/** Valore del cookie → tema; qualunque altro valore dà il tema scuro. */
export function parseTheme(raw: unknown): Theme {
  return raw === "light" ? "light" : "dark";
}
