import { Card, CardTitle } from "@/components/ui/primitives";
import { formatStat, humanize, sortPlayers, statRows } from "@/lib/football/details";
import type { MatchDetails } from "@/lib/football/queries";
import { getMessages } from "@/lib/i18n";

interface Team {
  id: number;
  name: string;
}

type Player = MatchDetails["players"][number];

function PlayerList({ players }: { players: readonly Player[] }) {
  const m = getMessages().matchCenter;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {players.map((p) => (
        <li key={`${p.player_name}-${p.shirt_number ?? ""}-${p.grid ?? ""}`} className="flex gap-2">
          <span className="w-6 text-right font-mono text-xs text-muted">
            {p.shirt_number ?? ""}
          </span>
          <span>{p.player_name}</span>
          {p.position ? (
            <span className="text-xs text-muted" title={m.positions[p.position]}>
              {p.position}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Lineup({ team, details }: { team: Team; details: MatchDetails }) {
  const m = getMessages().matchCenter;
  const lineup = details.lineups.find((l) => l.team_id === team.id);
  const { starters, bench } = sortPlayers(details.players.filter((p) => p.team_id === team.id));
  return (
    <div>
      <h4 className="text-sm font-medium">{team.name}</h4>
      {!lineup && starters.length === 0 ? (
        <p className="mt-1 text-sm text-muted">{m.noLineup}</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">
            {m.formation}: {lineup?.formation ?? "—"} · {m.coach}: {lineup?.coach_name ?? "—"}
          </p>
          <p className="mt-3 text-xs uppercase tracking-wide text-muted">{m.starters}</p>
          <PlayerList players={starters} />
          {bench.length > 0 ? (
            <>
              <p className="mt-3 text-xs uppercase tracking-wide text-muted">{m.bench}</p>
              <PlayerList players={bench} />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Statistiche di squadra e formazioni (ADR 0012), dalla fonte API-Football. */
export function MatchDetailsCard({
  home,
  away,
  details,
}: {
  home: Team;
  away: Team;
  details: MatchDetails;
}) {
  const m = getMessages().matchCenter;
  const rows = statRows(details.statistics, home.id, away.id);
  const hasLineups = details.lineups.length > 0 || details.players.length > 0;
  // Senza statistiche né formazioni il riquadro non compare: niente spiegazioni tecniche.
  if (rows.length === 0 && !hasLineups) return null;

  return (
    <Card className="mt-4">
      <CardTitle>{m.detailsTitle}</CardTitle>
      {rows.length === 0 && !hasLineups ? (
        <p className="mt-2 text-sm text-muted">{m.noDetails}</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">{m.statistics}</h3>
            {rows.length === 0 ? (
              <p className="text-sm text-muted">—</p>
            ) : (
              <table className="w-full text-sm">
                <caption className="sr-only">{m.statistics}</caption>
                <thead className="border-b border-border text-xs text-muted">
                  <tr>
                    <th scope="col" className="py-2 text-left font-medium">
                      {home.name}
                    </th>
                    <th scope="col" className="py-2 text-center font-medium">
                      <span className="sr-only">{m.statistics}</span>
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      {away.name}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.stat} className="border-b border-border last:border-0">
                      <td className="py-1.5 text-left font-mono">{formatStat(r.stat, r.home)}</td>
                      <th scope="row" className="py-1.5 text-center font-normal text-muted">
                        {m.statLabels[r.stat] ?? humanize(r.stat)}
                      </th>
                      <td className="py-1.5 text-right font-mono">{formatStat(r.stat, r.away)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">{m.lineups}</h3>
            {hasLineups ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Lineup team={home} details={details} />
                <Lineup team={away} details={details} />
              </div>
            ) : (
              <p className="text-sm text-muted">{m.noLineup}</p>
            )}
          </div>
        </div>
      )}
      <p className="mt-4 text-xs text-muted">{m.detailsSource}</p>
    </Card>
  );
}
