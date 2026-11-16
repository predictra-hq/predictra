import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { FreshnessBadge, ProviderAttribution } from "@/components/football/badges";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { healthTone, runStatusTone, severityTone } from "@/lib/football/format";
import {
  getSourceHealth,
  listCoverage,
  listOpenIssues,
  listRecentRuns,
} from "@/lib/football/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { SectionTabs } from "@/components/shell/section-tabs";

export const metadata: Metadata = { title: "Dati" };

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-4 py-3 ${className ?? ""}`}>
      {children}
    </th>
  );
}

export default async function DataCenterPage() {
  await requireUser();
  const m = getMessages();
  const d = m.dataCenter;
  const [sources, runs, issues, coverage] = await Promise.all([
    getSourceHealth(),
    listRecentRuns(),
    listOpenIssues(),
    listCoverage(),
  ]);
  const when = (value: string | null) => (value ? formatDateTime(value) : d.never);

  return (
    <>
      <SectionTabs section="system" current="/data-center" />
      <PageHeader title={d.title} description={d.description} />

      <h2 className="mb-3 text-lg font-semibold">{d.sources}</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {sources.map((s) => (
          <Card key={s.provider}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>
                <a href={s.website} target="_blank" rel="noreferrer" className="hover:underline">
                  {s.name}
                </a>
              </CardTitle>
              <div className="flex gap-2">
                <Badge tone={healthTone(s.health)}>{d.healthStatus[s.health]}</Badge>
                <FreshnessBadge freshness={s.freshness} />
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3">
              <Stat label={d.terms}>
                {s.terms_verified_at ? (
                  `${d.termsVerified} ${new Date(s.terms_verified_at).toLocaleDateString("it-IT")}`
                ) : (
                  <Badge tone="warning">{d.termsNotVerified}</Badge>
                )}
              </Stat>
              <Stat label={d.lastRun}>
                {s.last_run_status ? (
                  <span className="flex flex-col gap-1">
                    <span>{when(s.last_run_at)}</span>
                    <Badge tone={runStatusTone(s.last_run_status)} className="w-fit">
                      {d.runStatus[s.last_run_status]}
                    </Badge>
                  </span>
                ) : (
                  d.never
                )}
              </Stat>
              <Stat label={d.lastSuccess}>{when(s.last_success_at)}</Stat>
              <Stat label={d.runs24h}>{s.runs_24h}</Stat>
              <Stat label={d.failed24h}>{s.failed_runs_24h}</Stat>
              <Stat label={d.requests24h}>{s.requests_24h}</Stat>
              <Stat label={d.quota}>{s.quota_remaining ?? d.notAvailable}</Stat>
              <Stat label={d.issues}>{s.open_issues}</Stat>
            </dl>
            {s.last_error ? (
              <p className="mt-4 text-xs text-negative-strong">
                {d.lastError}: <span className="font-mono">{s.last_error}</span>
              </p>
            ) : null}
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">{d.coverage}</h2>
      <Card scrollLabel={d.coverage} className="p-0">
        {coverage.length === 0 ? (
          <p className="p-5 text-sm text-muted">{d.noCoverage}</p>
        ) : (
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="sr-only">{d.coverage}</caption>
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <Th>{m.matchCenter.competition}</Th>
                <Th>{d.seasonCol}</Th>
                <Th className="text-right">{d.matches}</Th>
              </tr>
            </thead>
            <tbody>
              {coverage.map((c) => (
                <tr key={c.competitionId} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    {c.name}
                    {c.areaName ? <span className="text-muted"> · {c.areaName}</span> : null}
                  </td>
                  <td className="px-4 py-3">{c.seasonLabel ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">{c.matches}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <h2 className="mb-3 mt-8 text-lg font-semibold">{d.recentRuns}</h2>
      <Card scrollLabel={d.recentRuns} className="p-0">
        {runs.length === 0 ? (
          <p className="p-5 text-sm text-muted">{d.noRuns}</p>
        ) : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">{d.recentRuns}</caption>
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <Th>{d.started}</Th>
                <Th>{d.window}</Th>
                <Th>{d.health}</Th>
                <Th className="text-right">{d.requests}</Th>
                <Th className="text-right">{d.rows}</Th>
                <Th className="text-right">{d.errors}</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {formatDateTime(r.started_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs">{r.window_key}</span>
                    {r.error_summary ? (
                      <span className="mt-1 block text-xs text-negative-strong">
                        {r.error_summary}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={runStatusTone(r.status)}>{d.runStatus[r.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{r.requests_used}</td>
                  <td className="px-4 py-3 text-right font-mono">{r.rows_upserted}</td>
                  <td className="px-4 py-3 text-right font-mono">{r.error_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <h2 className="mb-3 mt-8 text-lg font-semibold">{d.issues}</h2>
      <Card scrollLabel={d.issues} className="p-0">
        {issues.length === 0 ? (
          <p className="p-5 text-sm text-muted">{d.noOpenIssues}</p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">{d.issues}</caption>
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <Th>{d.severity}</Th>
                <Th>{d.check}</Th>
                <Th>{d.entity}</Th>
                <Th>{d.lastSeen}</Th>
              </tr>
            </thead>
            <tbody>
              {issues.map((i) => (
                <tr key={i.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Badge tone={severityTone(i.severity)}>{d.issueSeverity[i.severity]}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{i.check_code}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {i.entity_type === "match" && i.entity_id ? (
                      <Link href={`/match-center/${i.entity_id}`} className="hover:text-fg">
                        {i.entity_type}:{i.provider_entity_id ?? i.entity_id}
                      </Link>
                    ) : (
                      `${i.entity_type ?? "—"}:${i.provider_entity_id ?? i.entity_id ?? "—"}`
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {formatDateTime(i.last_seen_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <ProviderAttribution texts={sources.map((s) => s.attribution)} />
    </>
  );
}
