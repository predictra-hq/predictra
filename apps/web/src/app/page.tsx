import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BadgeCheck,
  BarChart3,
  Calculator,
  ChevronDown,
  Database,
  EyeOff,
  KeyRound,
  Layers,
  Lock,
  MailX,
  Target,
  Wallet,
} from "lucide-react";
import { DemoVideo } from "@/components/landing/demo-video";
import { Logo } from "@/components/shell/logo";
import { getMessages } from "@/lib/i18n";
import { formatRelease } from "@/lib/version";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: { absolute: "PREDICTRA" } };

const FOR_ICONS = [BarChart3, Target, Wallet];
const TRUST_ICONS = [Database, Calculator, BadgeCheck];
const SAFETY_ICONS = [Lock, KeyRound, EyeOff, MailX];

function LoginButton({ label, large = false }: { label: string; large?: boolean }) {
  return (
    <Link
      href="/login"
      className={
        large
          ? "inline-block rounded-xl bg-positive px-6 py-3 font-semibold text-on-positive transition-colors hover:bg-positive-strong"
          : "rounded-lg bg-positive px-4 py-2 text-sm font-semibold text-on-positive transition-colors hover:bg-positive-strong"
      }
    >
      {label}
    </Link>
  );
}

/** Titolo di sezione allineato a sinistra: è la «gamba» della F che l'occhio scorre in verticale. */
function SectionTitle({ id, title, text }: { id?: string; title: string; text?: string }) {
  return (
    <div className="max-w-2xl">
      <h2 id={id} className="scroll-mt-20 text-2xl font-bold sm:text-3xl">
        {title}
      </h2>
      {text ? <p className="mt-2 text-muted">{text}</p> : null}
    </div>
  );
}

/**
 * Presentazione prima del login, impaginata a F e pensata per chi non conosce PREDICTRA.
 * L'occhio scorre la riga in alto (nome, menu, «Accedi»), poi il titolo, poi scende lungo il
 * lato sinistro, dove ogni sezione risponde a una domanda: a cosa serve, è facile, perché
 * fidarsi, è sicuro, e i dubbi più comuni (sistema fake, costi, cosa offre).
 * Nessun numero reale né promessa di vincita; la dimostrazione usa dati DEMO.
 * Chi ha già una sessione va in Home.
 */
export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) redirect("/dashboard");

  const m = getMessages();
  const t = m.landing;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo className="size-9" />
            <span className="text-lg font-bold tracking-[0.2em]">
              {m.app.name}
              <span className="text-positive">.</span>
            </span>
          </Link>
          <nav
            aria-label={t.about}
            className="hidden items-center gap-6 text-sm text-muted md:flex"
          >
            <a href="#come-funziona" className="hover:text-fg">
              {t.nav.how}
            </a>
            <a href="#sicurezza" className="hover:text-fg">
              {t.nav.safety}
            </a>
            <a href="#domande" className="hover:text-fg">
              {t.nav.faq}
            </a>
          </nav>
          <LoginButton label={t.login} />
        </div>
      </header>

      <main>
        {/* Presentazione e dimostrazione della scheda partita. */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:pt-16">
          <div>
            <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              {t.heroTitle}
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted">{t.heroText}</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <LoginButton label={t.login} large />
              <p className="max-w-xs text-sm text-subtle">{t.inviteOnly}</p>
            </div>
          </div>
          <DemoVideo t={t} />
        </section>

        {/* A cosa serve: risponde a «non vedo cosa possa interessarmi». */}
        <section className="border-t border-border bg-surface/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
            <SectionTitle title={t.forTitle} text={t.forText} />
            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {t.forItems.map((item, i) => {
                const Icon = FOR_ICONS[i] ?? Layers;
                return (
                  <li
                    key={item.title}
                    className="rounded-[var(--radius-card)] border border-border bg-surface p-5"
                  >
                    <span className="flex size-10 items-center justify-center rounded-xl bg-positive-soft text-positive-strong">
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm text-muted">{item.text}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Come funziona: risponde a «è facile?». */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
          <SectionTitle id="come-funziona" title={t.howTitle} text={t.howText} />
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {t.howSteps.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-positive/40 font-bold text-positive-strong"
                >
                  {i + 1}
                </span>
                <span>
                  <span className="block font-semibold">{step.title}</span>
                  <span className="mt-1 block text-sm text-muted">{step.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Perché fidarsi: risponde a «il solito sistema fake?». */}
        <section className="border-t border-border bg-surface/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
            <SectionTitle title={t.trustTitle} />
            <ul className="mt-8 grid gap-6 md:grid-cols-3">
              {t.trustItems.map((item, i) => {
                const Icon = TRUST_ICONS[i] ?? BadgeCheck;
                return (
                  <li key={item.title} className="flex gap-4">
                    <Icon size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-positive" />
                    <span>
                      <span className="block font-semibold">{item.title}</span>
                      <span className="mt-1 block text-sm text-muted">{item.text}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* È sicuro? */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
          <SectionTitle id="sicurezza" title={t.safetyTitle} />
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {t.safetyItems.map((item, i) => {
              const Icon = SAFETY_ICONS[i] ?? Lock;
              return (
                <li
                  key={item.title}
                  className="flex gap-4 rounded-[var(--radius-card)] border border-border bg-surface p-5"
                >
                  <Icon size={22} aria-hidden="true" className="mt-0.5 shrink-0 text-positive" />
                  <span>
                    <span className="block font-semibold">{item.title}</span>
                    <span className="mt-1 block text-sm text-muted">{item.text}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Dubbi frequenti: fake, costi, cosa offre, facilità, dati. */}
        <section className="border-t border-border bg-surface/40">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-8">
            <SectionTitle id="domande" title={t.faqTitle} />
            <div className="mt-8 flex flex-col gap-3">
              {t.faq.map((item) => (
                <details
                  key={item.q}
                  className="group rounded-[var(--radius-card)] border border-border bg-surface"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 font-semibold [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <ChevronDown
                      size={18}
                      aria-hidden="true"
                      className="shrink-0 text-muted transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <p className="px-4 pb-4 text-sm text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-8">
          <div className="flex flex-col items-start justify-between gap-6 rounded-[var(--radius-card)] border border-positive/40 bg-positive-soft p-8 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-bold">{t.finalTitle}</h2>
              <p className="mt-1 text-muted">{t.finalText}</p>
            </div>
            <LoginButton label={t.login} large />
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl border-t border-border px-4 py-8 text-xs text-subtle sm:px-8">
        <p className="font-medium text-muted">{t.responsible}</p>
        <p className="mt-2">{m.app.disclaimer}</p>
        <p className="mt-2">
          {m.app.name} {formatRelease()}
        </p>
      </footer>
    </div>
  );
}
