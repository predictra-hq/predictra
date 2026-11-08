import Link from "next/link";
import { Badge, Card } from "@/components/ui/primitives";
import { getAgentStatus } from "@/lib/agent/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { formatMinutes, healthTone, lastSuccess, overallHealth } from "./status";

/**
 * Card "Stato agente" della dashboard (M7 B1): ultimo ciclo riuscito, frequenza
 * reale osservata e stato "degradato" oltre la soglia di `v_agent_status`.
 * I dati sono visibili solo con `agents.monitor` (RLS): agli altri un messaggio.
 */
export async function AgentStatusCard({ canMonitor }: { canMonitor: boolean }) {
  const m = getMessages();
  const a = m.agent;
  const title = (
    <p className="text-xs uppercase tracking-wide text-muted">{m.dashboard.agentStatus}</p>
  );
  if (!canMonitor) {
    return (
      <Card>
        {title}
        <p className="mt-2 text-sm text-muted">{a.monitorsOnly}</p>
      </Card>
    );
  }

  const rows = await getAgentStatus().catch(() => null);
  if (!rows) {
    return (
      <Card>
        {title}
        <p className="mt-2 text-sm text-muted">{a.unavailable}</p>
      </Card>
    );
  }
  const health = overallHealth(rows);
  const success = lastSuccess(rows);
  const active = rows.filter((r) => r.last_run_at);

  return (
    <Card>
      {title}
      <Link href="/admin/agent" className="mt-2 flex flex-col gap-1">
        <span>
          <Badge tone={healthTone(health)}>{a.health[health]}</Badge>
        </span>
        <span className="text-xs text-muted">
          {a.lastSuccess}: {success ? formatDateTime(success) : "—"}
        </span>
        {active.map((r) => {
          const observed = formatMinutes(r.observed_interval_minutes);
          return (
            <span key={r.source} className="text-xs text-muted">
              {a.source[r.source]}: {observed ? `${a.every} ${observed}` : "—"} ({a.expectedEvery}{" "}
              {formatMinutes(r.expected_interval_minutes)})
            </span>
          );
        })}
      </Link>
    </Card>
  );
}
