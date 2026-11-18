import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { StyledName } from "@/components/community/styled-name";
import { Card, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { isAdult, todayInRome } from "@/lib/community/community";
import { getOwnCommunityProfile, listRecentComments } from "@/lib/community/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";

export const metadata: Metadata = { title: "Discussioni" };

/**
 * Discussioni: gli ultimi commenti di tutte le partite, con il collegamento alla partita
 * dove rispondere. Come i commenti, si sblocca con una data di nascita di almeno 18 anni
 * fa (Preferenze); il database ricontrolla (`recent_comment_feed`).
 */
export default async function DiscussionsPage() {
  const user = await requireUser();
  const m = getMessages();
  const d = m.discussions;
  const own = await getOwnCommunityProfile(user.id);

  if (!isAdult(own.birthDate, todayInRome())) {
    return (
      <>
        <PageHeader title={d.title} description={d.description} />
        <Card className="max-w-xl">
          <p className="flex items-center gap-2 font-medium">
            <Lock size={18} aria-hidden="true" className="text-muted" />
            {d.lockedTitle}
          </p>
          <p className="mt-2 text-sm text-muted">
            {own.birthDate ? m.comments.underAge : m.comments.locked}
          </p>
          {!own.birthDate ? (
            <Link
              href="/settings/preferences#birthday"
              className="mt-3 inline-block text-sm font-medium text-positive-strong underline underline-offset-2"
            >
              {m.comments.unlock}
            </Link>
          ) : null}
        </Card>
      </>
    );
  }

  const comments = await listRecentComments(50);
  return (
    <>
      <PageHeader title={d.title} description={d.description} />
      <p className="mb-4 text-xs text-subtle">{m.comments.rules}</p>
      {comments === null ? (
        <Card>
          <p className="text-sm text-muted">{m.common.genericError}</p>
        </Card>
      ) : comments.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{d.empty}</p>
        </Card>
      ) : (
        <ol className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id}>
              <Card className="p-4">
                <Link
                  href={`/match-center/${c.match_id}#comments`}
                  className="text-sm font-medium text-positive-strong hover:underline"
                >
                  {c.home_team} – {c.away_team}
                </Link>
                <p className="mt-1 text-xs text-subtle">
                  <StyledName name={c.author_name} color={c.name_color} style={c.name_style} /> ·{" "}
                  {formatDateTime(c.created_at)}
                </p>
                <p className="mt-2 whitespace-pre-line break-words text-sm">{c.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
