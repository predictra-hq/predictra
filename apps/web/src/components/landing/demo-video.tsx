"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { Messages } from "@/lib/i18n";
import { fillTemplate } from "@/lib/odds/format";
import { cn } from "@/lib/utils";

const SCENES = ["matches", "model", "certainties", "bankroll"] as const;
type Scene = (typeof SCENES)[number];

/** Durata di ogni scena. */
export const SCENE_MS = 5000;

type Texts = Messages["landing"];

function DemoBadge({ label }: { label: string }) {
  return (
    <span className="rounded-md border border-warning/40 bg-warning-soft px-1.5 py-0.5 text-xs font-semibold tracking-wider text-warning">
      {label}
    </span>
  );
}

/* Le scene: interfacce semplificate con dati di esempio (etichetta DEMO), mai dati reali. */

function Matches({ t }: { t: Texts }) {
  return (
    <ul className="flex flex-col gap-2">
      {t.demoMatches.map((match, i) => (
        <li
          key={match}
          className="demo-in flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
          style={{ animationDelay: `${i * 150}ms` }}
        >
          <span>{match}</span>
          <span className="tabular-nums text-muted">{`${18 + i}:00`}</span>
        </li>
      ))}
    </ul>
  );
}

function Model({ t }: { t: Texts }) {
  const bars = [
    { label: "1", value: 48 },
    { label: "X", value: 27 },
    { label: "2", value: 25 },
  ];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">{t.demoMatches[0]}</p>
      {bars.map((bar, i) => (
        <div key={bar.label} className="flex items-center gap-3 text-sm">
          <span className="w-4 font-semibold">{bar.label}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="demo-grow h-full rounded-full bg-positive"
              style={{ width: `${bar.value}%`, animationDelay: `${i * 200}ms` }}
            />
          </div>
          <span className="w-10 text-right tabular-nums">{bar.value}%</span>
        </div>
      ))}
    </div>
  );
}

function Certainties({ t }: { t: Texts }) {
  return (
    <div className="flex flex-col gap-2">
      {[91, 88].map((p, i) => (
        <div
          key={p}
          className="demo-in flex items-center justify-between gap-3 rounded-lg border border-positive/30 bg-positive-soft px-3 py-2.5 text-sm"
          style={{ animationDelay: `${i * 200}ms` }}
        >
          <span>
            <span className="block font-medium">{t.demoBet}</span>
            <span className="text-xs text-muted">{t.demoMatches[i + 1]}</span>
          </span>
          <span className="text-lg font-semibold tabular-nums text-positive-strong">{p}%</span>
        </div>
      ))}
    </div>
  );
}

function Bankroll({ t }: { t: Texts }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{t.demoBalance}</p>
      <svg viewBox="0 0 300 110" className="w-full" aria-hidden="true">
        <line x1="0" y1="100" x2="300" y2="100" className="stroke-border" strokeWidth="1" />
        <polyline
          points="0,85 40,78 80,82 120,64 160,70 200,52 240,46 300,30"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="demo-draw stroke-positive"
        />
      </svg>
    </div>
  );
}

const VIEWS: Record<Scene, (props: { t: Texts }) => React.ReactNode> = {
  matches: Matches,
  model: Model,
  certainties: Certainties,
  bankroll: Bankroll,
};

/**
 * «Video» di presentazione: quattro scene animate che si susseguono da sole, con pausa e
 * scelta della scena. È scritto nel codice (nessun file video da scaricare, nessun costo)
 * e mostra solo dati di esempio etichettati DEMO. Se il sistema chiede meno movimento le
 * scene non scorrono da sole finché non si preme «Riproduci».
 */
export function DemoVideo({ t }: { t: Texts }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const userPlayed = useRef(false);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce && !userPlayed.current) return;
      setIndex((i) => (i + 1) % SCENES.length);
    }, SCENE_MS);
    return () => window.clearInterval(timer);
  }, [playing, index]);

  const scene = SCENES[index]!;

  return (
    <figure
      aria-label={t.videoLabel}
      className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-xl"
    >
      <div className="flex gap-1.5 px-4 pt-4" role="tablist" aria-label={t.videoLabel}>
        {SCENES.map((s, i) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`${fillTemplate(t.sceneOf, { n: i + 1, total: SCENES.length })}: ${t.scenes[s].title}`}
            onClick={() => setIndex(i)}
            className="h-6 flex-1 cursor-pointer py-2.5"
          >
            <span
              className={cn(
                "block h-1 rounded-full transition-colors",
                i <= index ? "bg-positive" : "bg-surface-2",
              )}
            />
          </button>
        ))}
      </div>
      {/*
        Tutte le scene stanno una sopra l’"+"altra nella stessa cella della griglia e si vede solo
        quella attiva: il riquadro prende l’"+"altezza della più alta e non cambia mai, quindi
        cambiando scena la pagina intorno non si muove.
      */}
      <div className="flex items-start justify-between gap-2 px-4 pt-2">
        <div className="grid min-w-0 flex-1" aria-live="polite">
          {SCENES.map((s) => (
            <div
              key={s}
              aria-hidden={s !== scene}
              className={cn("col-start-1 row-start-1", s !== scene && "invisible")}
            >
              <p className="font-semibold">{t.scenes[s].title}</p>
              <p className="text-sm text-muted">{t.scenes[s].text}</p>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            userPlayed.current = true;
            setPlaying((p) => !p);
          }}
          aria-label={playing ? t.pause : t.play}
          className="shrink-0 cursor-pointer rounded-full border border-border p-2 text-muted hover:bg-surface-2 hover:text-fg"
        >
          {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
        </button>
      </div>
      <div className="grid px-4 py-4">
        {SCENES.map((s) => {
          const SceneView = VIEWS[s];
          return (
            <div
              // La scena attiva cambia chiave a ogni giro: le animazioni ripartono da capo.
              key={s === scene ? `${s}-attiva` : s}
              aria-hidden={s !== scene}
              className={cn("col-start-1 row-start-1", s !== scene && "invisible")}
            >
              <SceneView t={t} />
            </div>
          );
        })}
      </div>
      <figcaption className="flex items-center gap-2 border-t border-border px-4 py-2 text-xs text-subtle">
        <DemoBadge label={t.demo} />
        {t.demoNote}
      </figcaption>
    </figure>
  );
}
