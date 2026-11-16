import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import { DEFAULT_LOCALE, getMessages } from "@/lib/i18n";
import { parseTheme, THEME_COLOR, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const m = getMessages();

export const metadata: Metadata = {
  title: { default: m.app.name, template: `%s · ${m.app.name}` },
  description: m.app.tagline,
  // Piattaforma privata: non indicizzabile.
  robots: { index: false, follow: false, nocache: true },
};

export async function generateViewport(): Promise<Viewport> {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  // `cover`: su iPhone l'app arriva ai bordi e le barre rispettano la zona dei gesti (env(safe-area-inset-*)).
  return { themeColor: THEME_COLOR[theme], colorScheme: theme, viewportFit: "cover" };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Il nonce della CSP si applica solo al rendering dinamico: nessuna pagina statica.
  await connection();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang={DEFAULT_LOCALE}
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
