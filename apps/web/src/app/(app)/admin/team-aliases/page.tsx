import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Alert, Badge, Card, PageHeader, Select } from "@/components/ui/primitives";
import { requirePermission } from "@/lib/auth/dal";
import { formatDateTime, getMessages } from "@/lib/i18n";
import {
  listAliasesFor,
  listManualAliases,
  listTeamsByCompetition,
  listUnmatchedEvents,
  type CompetitionTeams,
  type TeamOption,
} from "@/lib/odds/alias-queries";
import { buildAliasIndex, namesToMap, suggestTeam, type NameToMap } from "@/lib/odds/aliases";
import { fillTemplate } from "@/lib/odds/format";
import { addTeamAlias } from "./actions";

export const metadata: Metadata = { title: "Alias squadre" };

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-4 py-3 ${className ?? ""}`}>
      {children}
    </th>
  );
}

function resolutionTone(status: NameToMap["resolution"]["status"]) {
  return status === "known" ? "positive" : status === "ambiguous" ? "negative" : "warning";
}

function AliasForm({
  entry,
  groups,
  others,
  index,
}: {
  entry: NameToMap;
  groups: readonly CompetitionTeams[];
  others: readonly TeamOption[];
  index: number;
}) {
  const m = getMessages().teamAliases;
  // Prima le competizioni in cui compare il nome, poi tutte le altre.
  const relevant = groups.filter((g) => g.code && entry.competitionCodes.includes(g.code));
  const rest = groups.filter((g) => !relevant.includes(g));
  const candidates = (relevant.length > 0 ? relevant : groups).flatMap((g) => g.teams);
  const suggestion = suggestTeam(entry.name, candidates);
  const selectId = `team-${index}`;
  return (
    <ActionForm action={addTeamAlias} className="flex flex-col gap-2">
      <input type="hidden" name="alias" value={entry.name} />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={selectId} className="sr-only">
          {m.team}: {entry.name}
        </label>
        <Select id={selectId} name="teamId" defaultValue="" required className="h-9 w-72 text-sm">
          <option value="" disabled>
            {m.chooseTeam}
          </option>
          {[...relevant, ...rest].map((g) => (
            <optgroup key={g.code ?? g.name} label={g.name}>
              {g.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          ))}
          {others.length > 0 ? (
            <optgroup label={m.otherTeams}>
              {others.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </Select>
        <SubmitButton variant="secondary" className="h-9 px-3 text-xs">
          {m.save}
        </SubmitButton>
      </div>
      {suggestion ? (
        <p className="text-xs text-muted">
          {fillTemplate(m.suggestion, { team: suggestion.name })}
        </p>
      ) : null}
    </ActionForm>
  );
}

export default async function TeamAliasesPage() {
  // Solo Super Admin con 2FA; il database lo ricontrolla in add_team_alias.
  await requirePermission("providers.manage");
  const m = getMessages().teamAliases;

  const events = await listUnmatchedEvents();
  const [aliases, teams, manual] = await Promise.all([
    listAliasesFor(events.flatMap((e) => [e.homeTeam, e.awayTeam])),
    listTeamsByCompetition(),
    listManualAliases(),
  ]);
  const names = namesToMap(events, buildAliasIndex(aliases));

  return (
    <>
      <PageHeader title={m.title} description={m.description} />
      <Alert className="mb-3">{m.rules}</Alert>
      <Alert tone="warning" className="mb-6">
        {m.nextRunNote}
      </Alert>

      <h2 className="mb-3 text-lg font-semibold">{m.namesTitle}</h2>
      <Card className="mb-8 overflow-x-auto p-0">
        {names.length === 0 ? (
          <p className="p-5 text-sm text-muted">{m.noIssues}</p>
        ) : (
          <table className="w-full min-w-[880px] text-left text-sm">
            <caption className="sr-only">{m.namesTitle}</caption>
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <Th>{m.receivedName}</Th>
                <Th>{m.competitions}</Th>
                <Th className="text-right">{m.events}</Th>
                <Th>{m.status}</Th>
                <Th>{m.team}</Th>
              </tr>
            </thead>
            <tbody>
              {names.map((entry, i) => (
                <tr
                  key={entry.normalized}
                  className="border-b border-border align-top last:border-0"
                >
                  <td className="px-4 py-3 font-mono text-xs">{entry.name}</td>
                  <td className="px-4 py-3 text-muted">
                    {entry.competitionCodes.join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{entry.events}</td>
                  <td className="px-4 py-3">
                    <Badge tone={resolutionTone(entry.resolution.status)}>
                      {m.resolution[entry.resolution.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {entry.resolution.status === "missing" ? (
                      <AliasForm
                        entry={entry}
                        groups={teams.groups}
                        others={teams.others}
                        index={i}
                      />
                    ) : (
                      <p className="max-w-sm text-xs text-muted">
                        {entry.resolution.status === "known" ? m.knownHint : m.ambiguousHint}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <h2 className="mb-1 text-lg font-semibold">{m.eventsTitle}</h2>
      <p className="mb-3 text-sm text-muted">{m.eventsDescription}</p>
      <Card className="mb-8 overflow-x-auto p-0">
        {events.length === 0 ? (
          <p className="p-5 text-sm text-muted">{m.noIssues}</p>
        ) : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">{m.eventsTitle}</caption>
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <Th>{m.kickoff}</Th>
                <Th>{m.competition}</Th>
                <Th>{m.homeTeam}</Th>
                <Th>{m.awayTeam}</Th>
                <Th>{m.lastSeen}</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.issueId} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {e.commenceTime ? formatDateTime(e.commenceTime) : "—"}
                  </td>
                  <td className="px-4 py-3">{e.competitionCode ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{e.homeTeam}</td>
                  <td className="px-4 py-3 font-mono text-xs">{e.awayTeam}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {formatDateTime(e.lastSeenAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <h2 className="mb-3 text-lg font-semibold">{m.manualTitle}</h2>
      <Card className="overflow-x-auto p-0">
        {manual.length === 0 ? (
          <p className="p-5 text-sm text-muted">{m.noManual}</p>
        ) : (
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="sr-only">{m.manualTitle}</caption>
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <Th>{m.alias}</Th>
                <Th>{m.team}</Th>
                <Th>{m.createdAt}</Th>
              </tr>
            </thead>
            <tbody>
              {manual.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{a.alias}</td>
                  <td className="px-4 py-3">{a.teamName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">
                    {formatDateTime(a.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
