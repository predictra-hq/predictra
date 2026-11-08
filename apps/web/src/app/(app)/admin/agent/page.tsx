import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AGENT_JOB_STATUSES, type AgentJobStatus } from "@predictra/shared-types";
import {
  currentWindows,
  formatMinutes,
  healthTone,
  sourceHealth,
  usagePercent,
} from "@/components/agent/status";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardTitle,
  Field,
  PageHeader,
  Select,
} from "@/components/ui/primitives";
import {
  getAgentStatus,
  getQueueSummary,
  listJobs,
  listRateLimits,
  listRuns,
} from "@/lib/agent/queries";
import { requirePermission } from "@/lib/auth/dal";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { retryDeadJob } from "./actions";

export const metadata: Metadata = { title: "Agente" };

const JOB_TONE: Record<AgentJobStatus, "neutral" | "positive" | "negative" | "warning"> = {
  queued: "neutral",
  running: "neutral",
  done: "positive",
  failed: "warning",
  dead: "negative",
};
const RUN_TONE = {
  running: "neutral",
  succeeded: "positive",
  partial: "warning",
  failed: "negative",
} as const;

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-3 py-2 text-left ${className ?? ""}`}>
      {children}
    </th>
  );
}

function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-top ${className ?? ""}`}>{children}</td>;
}

function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted">
          <tr className="border-b border-border">{head}</tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

function durationMinutes(start: string, end: string | null): string {
  if (!end) return "—";
  const seconds = Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 1000);
  return seconds < 60 ? `${Math.round(seconds)} s` : (formatMinutes(seconds / 60) ?? "—");
}

function parseStatus(value: string | string[] | undefined): AgentJobStatus | null {
  const v = Array.isArray(value) ? value[0] : value;
  return (AGENT_JOB_STATUSES as readonly string[]).includes(v ?? "") ? (v as AgentJobStatus) : null;
}

export default async function AgentPage({ searchParams }: PageProps<"/admin/agent">) {
  const m = getMessages();
  const a = m.agent;
  await requirePermission("agents.monitor");
  const status = parseStatus((await searchParams).status);

  const [sources, queue, budgets, runs, jobs] = await Promise.all([
    getAgentStatus().catch(() => null),
    getQueueSummary().catch(() => null),
    listRateLimits().catch(() => null),
    listRuns().catch(() => null),
    listJobs(status).catch(() => null),
  ]);
  const unavailable = !sources || !queue || !budgets || !runs || !jobs;

  return (
    <>
      <PageHeader title={a.title} description={a.description} />
      {unavailable ? <Alert tone="negative">{a.unavailable}</Alert> : null}

      <Card>
        <CardTitle>{a.sourcesTitle}</CardTitle>
        <Table
          head={
            <>
              <Th>{a.provider}</Th>
              <Th>{a.status}</Th>
              <Th>{a.lastSuccess}</Th>
              <Th>{a.observedEvery}</Th>
              <Th>{a.runs24h}</Th>
              <Th>{a.failed24h}</Th>
              <Th>{a.degradedAfter}</Th>
            </>
          }
        >
          {(sources ?? []).map((s) => {
            const health = sourceHealth(s);
            return (
              <tr key={s.source}>
                <Td>{a.source[s.source]}</Td>
                <Td>
                  <Badge tone={healthTone(health)}>
                    {health === "never" ? a.notScheduled : a.health[health]}
                  </Badge>
                </Td>
                <Td>{s.last_success_at ? formatDateTime(s.last_success_at) : "—"}</Td>
                <Td>
                  {formatMinutes(s.observed_interval_minutes) ?? "—"}{" "}
                  <span className="text-xs text-muted">
                    ({a.expectedEvery} {formatMinutes(s.expected_interval_minutes)})
                  </span>
                </Td>
                <Td>{s.runs_24h}</Td>
                <Td>{s.failed_runs_24h}</Td>
                <Td>{formatMinutes(s.degraded_after_minutes)}</Td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>{a.queueTitle}</CardTitle>
          {queue && queue.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{a.queueEmpty}</p>
          ) : (
            <Table
              head={
                <>
                  <Th>{a.type}</Th>
                  <Th>{a.status}</Th>
                  <Th className="text-right">{a.jobs}</Th>
                  <Th className="text-right">{a.ready}</Th>
                  <Th className="text-right">{a.leaseExpired}</Th>
                  <Th>{a.nextRun}</Th>
                </>
              }
            >
              {(queue ?? []).map((q) => (
                <tr key={`${q.type}-${q.status}`}>
                  <Td className="font-mono text-xs">{q.type}</Td>
                  <Td>
                    <Badge tone={JOB_TONE[q.status]}>{a.jobStatus[q.status]}</Badge>
                  </Td>
                  <Td className="text-right">{q.jobs}</Td>
                  <Td className="text-right">{q.ready}</Td>
                  <Td className="text-right">{q.lease_expired}</Td>
                  <Td>{q.next_run_at ? formatDateTime(q.next_run_at) : "—"}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <CardTitle>{a.budgetTitle}</CardTitle>
          <p className="mt-1 text-xs text-muted">{a.budgetHint}</p>
          {budgets && budgets.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{a.budgetEmpty}</p>
          ) : (
            <Table
              head={
                <>
                  <Th>{a.provider}</Th>
                  <Th>{a.windowLabel}</Th>
                  <Th className="text-right">{a.used}</Th>
                </>
              }
            >
              {currentWindows(budgets ?? []).map((b) => {
                const pct = usagePercent(b);
                return (
                  <tr key={`${b.provider}-${b.window_kind}`}>
                    <Td className="font-mono text-xs">{b.provider}</Td>
                    <Td>
                      {a.window[b.window_kind]} · {formatDateTime(b.window_start)}
                    </Td>
                    <Td className="text-right">
                      <Badge tone={pct >= 80 ? "warning" : "neutral"}>
                        {b.used} / {b.quota} ({pct}%)
                      </Badge>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <CardTitle>{a.jobsTitle}</CardTitle>
          <form method="get" className="flex items-end gap-2">
            <Field label={a.status} htmlFor="status">
              <Select id="status" name="status" defaultValue={status ?? ""} className="h-9 text-sm">
                <option value="">{a.allStatuses}</option>
                {AGENT_JOB_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {a.jobStatus[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="secondary" className="h-9">
              {a.filter}
            </Button>
          </form>
        </div>
        {jobs && jobs.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{a.jobsEmpty}</p>
        ) : (
          <Table
            head={
              <>
                <Th>ID</Th>
                <Th>{a.type}</Th>
                <Th>{a.status}</Th>
                <Th className="text-right">{a.attempts}</Th>
                <Th>{a.lastError}</Th>
                <Th>{a.updated}</Th>
                <Th>
                  <span className="sr-only">{a.retry}</span>
                </Th>
              </>
            }
          >
            {(jobs ?? []).map((j) => (
              <tr key={j.id}>
                <Td className="font-mono text-xs">{j.id}</Td>
                <Td>
                  <span className="font-mono text-xs">{j.type}</span>
                  <span className="block break-all text-xs text-subtle">{j.idempotency_key}</span>
                </Td>
                <Td>
                  <Badge tone={JOB_TONE[j.status]}>{a.jobStatus[j.status]}</Badge>
                  {j.status === "failed" ? (
                    <span className="block text-xs text-muted">
                      {a.nextRun}: {formatDateTime(j.next_run_at)}
                    </span>
                  ) : null}
                </Td>
                <Td className="text-right">
                  {j.attempts}/{j.max_attempts}
                </Td>
                <Td className="max-w-md text-xs break-words text-muted">{j.last_error ?? "—"}</Td>
                <Td className="text-xs">{formatDateTime(j.updated_at)}</Td>
                <Td>
                  {j.status === "dead" ? (
                    <ActionForm action={retryDeadJob} className="flex flex-col gap-1">
                      <input type="hidden" name="jobId" value={j.id} />
                      <SubmitButton variant="secondary" className="h-8 text-xs">
                        {a.retry}
                      </SubmitButton>
                    </ActionForm>
                  ) : null}
                </Td>
              </tr>
            ))}
          </Table>
        )}
        <p className="mt-3 text-xs text-muted">{a.retryHint}</p>
      </Card>

      <Card className="mt-6">
        <CardTitle>{a.runsTitle}</CardTitle>
        {runs && runs.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{a.runsEmpty}</p>
        ) : (
          <Table
            head={
              <>
                <Th>{a.started}</Th>
                <Th>{a.provider}</Th>
                <Th>{a.status}</Th>
                <Th>{a.duration}</Th>
                <Th className="text-right">{a.claimed}</Th>
                <Th className="text-right">{a.done}</Th>
                <Th>{a.errors}</Th>
              </>
            }
          >
            {(runs ?? []).map((r) => (
              <tr key={r.id}>
                <Td className="text-xs">{formatDateTime(r.started_at)}</Td>
                <Td>
                  {a.source[r.source]}
                  <span className="block font-mono text-xs text-subtle">{r.schedule}</span>
                </Td>
                <Td>
                  <Badge tone={RUN_TONE[r.status]}>{a.runStatus[r.status]}</Badge>
                </Td>
                <Td>{durationMinutes(r.started_at, r.finished_at)}</Td>
                <Td className="text-right">{r.jobs_claimed}</Td>
                <Td className="text-right">{r.jobs_done}</Td>
                <Td className="max-w-md text-xs break-words text-muted">
                  {r.error_summary ?? "—"}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
