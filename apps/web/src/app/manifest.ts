import type { MetadataRoute } from "next";
import { getMessages } from "@/lib/i18n";

/**
 * Manifest dell'app: permette di aggiungere PREDICTRA alla schermata Home del telefono
 * e di aprirla a schermo intero. Nessun service worker: l'app resta solo online.
 * Icone generate da `icon.svg` (stesso simbolo di `components/shell/logo.tsx`).
 */
export default function manifest(): MetadataRoute.Manifest {
  const m = getMessages().app;
  return {
    name: m.name,
    short_name: m.name,
    description: m.tagline,
    lang: "it",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0a0b0d",
    theme_color: "#0a0b0d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
