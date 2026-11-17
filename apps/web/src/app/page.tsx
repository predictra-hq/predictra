import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  CircleSlash,
  Layers,
  MessageCircleQuestion,
  ShieldCheck,
  Target,
  Wallet,
} from "lucide-react";
import { DemoVideo } from "@/components/landing/demo-video";
import { Logo } from "@/components/shell/logo";
import { getMessages } from "@/lib/i18n";
import { formatRelease } from "@/lib/version";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: { absolute: "PREDICTRA" } };

const FEATURE_ICONS = [BarChart3, Target, Layers, ShieldCheck, Wallet, MessageCircleQuestion];

/**
 * Presentazione prima del login, impaginata a F: chi legge scorre la riga in alto (nome e
 * «Accedi»), poi una seconda riga più corta (titolo e frase), poi scende lungo il lato
 * sinistro, dove stanno i titoli delle funzioni. Chi ha già una sessione va in Home.
 */
export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) redirect("/dashboard");

  const m = getMessages();
  const t = m.landing;

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo className="size-9" />
          <span className="text-lg font-bold tracking-[0.2em]">
            {m.app.name}
            <span className="text-positive">.</span>
          </span>
        </Link>
        <Link
          href="/login"
          className="rounded-lg bg-positive px-4 py-2 text-sm font-semibold text-on-positive transition-colors hover:bg-positive-strong"
        >
          {t.login}
        </Link>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted">{m.app.tagline}</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">{t.heroTitle}</h1>
            <p className="mt-4 max-w-xl text-lg text-muted">{t.heroText}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/login"
                className="rounded-xl bg-positive px-6 py-3 font-semibold text-on-positive transition-colors hover:bg-positive-strong"
              >
                {t.login}
              </Link>
              <p className="max-w-xs text-sm text-subtle">{t.inviteOnly}</p>
            </div>
          </div>
          <DemoVideo t={t} />
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
          <h2 className="text-2xl font-bold">{t.featuresTitle}</h2>
          <ul className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {t.features.map((feature, i) => {
              const Icon = FEATURE_ICONS[i] ?? BarChart3;
              return (
                <li key={feature.title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-positive-soft text-positive-strong">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-semibold">{feature.title}</span>
                    <span className="block text-sm text-muted">{feature.text}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
          <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6">
            <h2 className="text-xl font-bold">{t.rulesTitle}</h2>
            <ul className="mt-4 flex flex-col gap-3">
              {t.rules.map((rule) => (
                <li key={rule} className="flex gap-3 text-sm">
                  <CircleSlash
                    size={18}
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-negative"
                  />
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl border-t border-border px-4 py-8 text-xs text-subtle sm:px-8">
        <p>{m.app.disclaimer}</p>
        <p className="mt-2">
          {m.app.name} {formatRelease()}
        </p>
      </footer>
    </div>
  );
}
