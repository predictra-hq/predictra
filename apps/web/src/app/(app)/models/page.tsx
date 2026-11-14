import type { Metadata } from "next";
import type { ReactNode } from "react";
import { hasPermission, type ModelVersionSummaryRow } from "@predictra/shared-types";
import { CalibrationChart } from "@/components/predictions/calibration-chart";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Alert, Badge, Card, CardTitle, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { runStatusTone } from "@/lib/football/format";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { formatPercent, modelStatusTone, relativeDelta } from "@/lib/predictions/format";
import { listModelVersions, listPredictionRuns } from "@/lib/predictions/queries";
import { activateModelVersion } from "./actions";

export const metadata: Metadata = { title: "Modelli" };

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-3 py-3 ${className ?? ""}`}>
      {children}
    </th>
  );
}

const metric = (value: number | null, digits = 4) =>
  value === null ? "–" : Number(value).toFixed(digits).replace(".", ",");

function Delta({ value, baseline }: { value: number | null; baseline: number | null }) {
  const delta = relativeDelta(value, baseline);
  if (delta === null) return null;
  const better = delta < 0;
  return (
    <span className={`ml-1 text-xs ${better ? "text-positive-strong" : "text-negative-strong"}`}>
      ({delta > 0 ? "+" : "−"}
      {formatPercent(Math.abs(delta))})
    </span>
  );
}

function ActivateButton({ version }: { version: ModelVersionSummaryRow }) {
  const m = getMessages().modelIntelligence;
  return (
    <ActionForm action={activateModelVersion} className="flex flex-col gap-1">
      <input type="hidden" name="modelVersionId" value={version.model_version_id} />
      <SubmitButton variant="secondary" className="h-8 px-3 text-xs">
        {m.activate}
      </SubmitButton>
    </ActionForm>
  );
}

export default async function ModelsPage() {
  const user = await requireUser();
  const m = getMessages();
  const mi = m.modelIntelligence;
  const canManage = hasPermission(user.roles, "models.manage") && user.aal2;
  const [versions, runs] = await Promise.all([listModelVersions(), listPredictionRuns()]);
  const active = versions.find((v) => v.status === "ACTIVE") ?? null;
  // In gara: il modello attivo e lo sfidante (ADR 0024). Lo storico è a parte.
  const current = versions.filter((v) => v.status !== "RETIRED");
  const retired = versions.filter((v) => v.status === "RETIRED");
  // Curva mostrata: modello attivo, altrimenti la versione più recente con un backtest.
  const featured = active ?? versions.find((v) => v.backtest_id !== null) ?? null;

  return (
    <>
      <PageHeader title={mi.title} description={mi.description} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardTitle>{mi.activeModel}</CardTitle>
          {active ? (
            <div className="mt-3 flex flex-col gap-1 text-sm">
              <p>
                <span className="font-medium">{mi.modelNames[active.model_key]}</span>{" "}
                <span className="font-mono text-xs text-muted">{active.version}</span>
              </p>
              <p className="text-muted">
                {mi.brier} {metric(active.brier)} · {mi.logLoss} {metric(active.log_loss)} ·{" "}
                {mi.ece} {metric(active.ece)}
              </p>
              {active.baseline_log_loss !== null ? (
                <p className="text-xs text-muted">
                  {mi.reference}: {mi.brier} {metric(active.baseline_brier)} · {mi.logLoss}{" "}
                  {metric(active.baseline_log_loss)}
                </p>
              ) : null}
              {active.activated_at ? (
                <p className="text-xs text-muted">{formatDateTime(active.activated_at)}</p>
              ) : null}
            </div>
          ) : (
            <Alert className="mt-3" tone="warning">
              {mi.noActive}
            </Alert>
          )}
          <p className="mt-4 text-xs text-muted">{mi.metricsHelp}</p>
        </Card>
        <Card>
          <CardTitle>{mi.calibration}</CardTitle>
          {featured && featured.calibration.length > 0 ? (
            <div className="mt-3">
              <p className="mb-2 text-xs text-muted">
                {mi.modelNames[featured.model_key]} · {featured.version}
              </p>
              <CalibrationChart bins={featured.calibration} label={featured.version} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">{mi.noBacktest}</p>
          )}
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">{mi.versions}</h2>
      {canManage ? <p className="mb-3 text-xs text-muted">{mi.activateHint}</p> : null}
      <Card scrollLabel={mi.versions} className="p-0">
        {current.length === 0 ? (
          <p className="p-5 text-sm text-muted">{mi.noVersions}</p>
        ) : (
          <table className="w-full min-w-[960px] text-left text-sm">
            <caption className="sr-only">{mi.versions}</caption>
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <Th>{mi.model}</Th>
                <Th>{mi.status}</Th>
                <Th className="text-right">{mi.trainingMatches}</Th>
                <Th className="text-right">{mi.backtestMatches}</Th>
                <Th className="text-right">{mi.brier}</Th>
                <Th className="text-right">{mi.logLoss}</Th>
                <Th className="text-right">{mi.ece}</Th>
                <Th>{mi.vsBaseline}</Th>
                {canManage ? (
                  <Th>
                    <span className="sr-only">{getMessages().common.actions}</span>
                  </Th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {current.map((v) => (
                <tr
                  key={v.model_version_id}
                  className="border-b border-border align-top last:border-0"
                >
                  <td className="whitespace-nowrap px-3 py-3">
                    <span className="font-medium">{mi.modelNames[v.model_key]}</span>
                    <span className="block font-mono text-xs text-muted">{v.version}</span>
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={modelStatusTone(v.status)}>{mi.modelStatus[v.status]}</Badge>
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{v.training_matches}</td>
                  <td className="px-3 py-3 text-right font-mono">{v.backtest_matches ?? "–"}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-mono">
                    {metric(v.brier)}
                    {v.model_key !== "baseline" ? (
                      <Delta value={v.brier} baseline={v.baseline_brier} />
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-mono">
                    {metric(v.log_loss)}
                    {v.model_key !== "baseline" ? (
                      <Delta value={v.log_loss} baseline={v.baseline_log_loss} />
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{metric(v.ece)}</td>
                  <td className="px-3 py-3">
                    {v.backtest_id === null ? (
                      <span className="text-xs text-muted">{mi.noBacktest}</span>
                    ) : v.model_key === "baseline" ? (
                      "—"
                    ) : (
                      <Badge tone={v.beats_baseline ? "positive" : "negative"}>
                        {v.beats_baseline ? mi.beatsBaseline : mi.notBeatsBaseline}
                      </Badge>
                    )}
                  </td>
                  {canManage ? (
                    <td className="px-3 py-3">
                      {v.status !== "ACTIVE" && v.beats_baseline ? (
                        <ActivateButton version={v} />
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {retired.length > 0 ? (
        <details className="mt-6 rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {mi.history} ({retired.length})
          </summary>
          <p className="mt-2 text-xs text-muted">{mi.historyHint}</p>
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {retired.map((v) => (
              <li key={v.model_version_id} className="flex flex-wrap gap-x-3">
                <span className="font-medium">{mi.modelNames[v.model_key]}</span>
                <span className="font-mono text-xs text-muted">{v.version}</span>
                <span className="text-xs text-muted">
                  {mi.logLoss} {metric(v.log_loss)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <h2 className="mb-3 mt-8 text-lg font-semibold">{mi.recentRuns}</h2>
      <Card scrollLabel={mi.recentRuns} className="p-0">
        {runs.length === 0 ? (
          <p className="p-5 text-sm text-muted">{mi.noRuns}</p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">{mi.recentRuns}</caption>
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <Th>{mi.started}</Th>
                <Th>{mi.model}</Th>
                <Th>{mi.status}</Th>
                <Th className="text-right">{mi.matchesScored}</Th>
                <Th className="text-right">{mi.rows}</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-border align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-3 text-muted">
                    {formatDateTime(r.started_at)}
                  </td>
                  <td className="px-3 py-3">
                    {r.model_versions ? mi.modelNames[r.model_versions.model_key] : "—"}
                    {r.error_summary ? (
                      <span className="mt-1 block text-xs text-negative-strong">
                        {r.error_summary}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={runStatusTone(r.status)}>{m.dataCenter.runStatus[r.status]}</Badge>
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{r.matches_scored}</td>
                  <td className="px-3 py-3 text-right font-mono">{r.predictions_written}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="mt-8 text-xs text-subtle">{m.app.disclaimer}</p>
    </>
  );
}
