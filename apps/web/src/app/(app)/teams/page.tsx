import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { LeaguesNav } from "@/components/football/leagues-nav";
import { Button, Card, EmptyState, Field, Input, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { listFollowedTeams, listFollows } from "@/lib/football/follows";
import { searchTeams, type TeamInfo } from "@/lib/football/queries";
import { containsPattern, parseSearch, SEARCH_MIN_LENGTH } from "@/lib/football/team";
import { getMessages } from "@/lib/i18n";
import { fillTemplate } from "@/lib/odds/format";

export const metadata: Metadata = { title: "Squadre" };

function TeamList({ teams }: { teams: readonly TeamInfo[] }) {
  return (
    <Card className="p-0">
      <ul className="divide-y divide-border">
        {teams.map((t) => (
          <li key={t.id}>
            <Link
              href={`/teams/${t.id}`}
              className="flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-surface-2 active:bg-surface-2"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
              {t.tla ? <span className="font-mono text-xs text-muted">{t.tla}</span> : null}
              <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Ricerca delle squadre per nome: da qui si apre la pagina di ogni squadra. */
export default async function TeamsPage({ searchParams }: PageProps<"/teams">) {
  await requireUser();
  const m = getMessages().teams;
  const query = parseSearch((await searchParams).q);
  const teams = query ? await searchTeams(containsPattern(query)) : [];
  const followed = query ? [] : await listFollowedTeams((await listFollows()).teamIds);
  const f = getMessages().follows;

  return (
    <>
      <PageHeader title={getMessages().leagueIntelligence.title} description={m.description} />
      <LeaguesNav current="teams" />
      <Form action="/teams" className="mb-4 flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <Field label={m.searchLabel} htmlFor="q">
            <Input
              id="q"
              name="q"
              type="search"
              defaultValue={query ?? ""}
              placeholder={m.searchPlaceholder}
              minLength={SEARCH_MIN_LENGTH}
              maxLength={60}
              autoComplete="off"
              enterKeyHint="search"
              required
            />
          </Field>
        </div>
        <Button type="submit">{m.searchButton}</Button>
      </Form>

      {query === null ? (
        followed.length === 0 ? (
          <p className="text-sm text-muted">
            {m.searchHint} {f.empty}
          </p>
        ) : (
          <>
            <h2 className="mb-2 text-sm font-semibold">{f.teamsTitle}</h2>
            <TeamList teams={followed} />
          </>
        )
      ) : teams.length === 0 ? (
        <EmptyState>{fillTemplate(m.noResults, { q: query })}</EmptyState>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted" role="status">
            {fillTemplate(m.results, { n: teams.length })}
          </p>
          <TeamList teams={teams} />
        </>
      )}
    </>
  );
}
