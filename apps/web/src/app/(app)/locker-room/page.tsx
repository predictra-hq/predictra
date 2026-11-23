import type { Metadata } from "next";
import Link from "next/link";
import { COMMENT_MAX_LENGTH, highestRole, type CommunityChannel } from "@predictra/shared-types";
import { Message } from "@/components/community/message";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, Label, PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { listCommunityPosts, listRecentComments } from "@/lib/community/queries";
import { getMessages } from "@/lib/i18n";
import { deletePost, moderatePost, postMessage } from "./actions";

export const metadata: Metadata = { title: "Spogliatoio" };

const TABS = ["general", "slips", "matches"] as const;
type Tab = (typeof TABS)[number];
const CHANNEL: Record<Exclude<Tab, "matches">, CommunityChannel> = {
  general: "GENERAL",
  slips: "SLIPS",
};

/**
 * Spogliatoio (ADR 0064): tre chat per tutti gli iscritti. Generale per parlare di tutto,
 * Schedine per condividere e commentare le schedine, Partite con gli ultimi commenti
 * scritti sotto le partite. Ognuno compare con il nome, lo stile e l'immagine scelti nel
 * Profilo; mai l'email.
 */
export default async function LockerRoomPage({ searchParams }: PageProps<"/locker-room">) {
  const user = await requireUser();
  const m = getMessages();
  const c = m.community;
  const raw = (await searchParams).c;
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : "general";
  const role = highestRole(user.roles);
  const canModerate = (role === "ADMIN" || role === "SUPER_ADMIN") && user.aal2;

  return (
    <>
      <PageHeader title={c.title} description={c.description} />
      <nav aria-label={c.title} className="tab-strip mb-4">
        {TABS.map((t) => (
          <Link key={t} href={`/locker-room?c=${t}`} aria-current={t === tab ? "page" : undefined}>
            {c.tabs[t]}
          </Link>
        ))}
      </nav>
      <p className="mb-4 text-sm text-muted">{c.tabHints[tab]}</p>

      {tab === "matches" ? (
        <MatchesChat />
      ) : (
        <Chat channel={CHANNEL[tab]} canModerate={canModerate} />
      )}
      <p className="mt-6 text-xs text-subtle">{c.rules}</p>
    </>
  );
}

async function Chat({ channel, canModerate }: { channel: CommunityChannel; canModerate: boolean }) {
  const m = getMessages();
  const c = m.community;
  const posts = await listCommunityPosts(channel);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card>
        <ActionForm action={postMessage}>
          <input type="hidden" name="channel" value={channel} />
          <Label htmlFor="post-body" className="sr-only">
            {c.label}
          </Label>
          <textarea
            id="post-body"
            name="body"
            required
            maxLength={COMMENT_MAX_LENGTH}
            rows={3}
            placeholder={channel === "SLIPS" ? c.placeholderSlips : c.placeholder}
            className="w-full rounded-xl border border-input bg-bg px-3 py-2.5 text-sm text-fg placeholder:text-subtle focus:border-positive focus:outline-none focus:ring-2 focus:ring-positive/30"
          />
          <SubmitButton className="self-start">{c.publish}</SubmitButton>
        </ActionForm>
      </Card>
      {posts === null ? (
        <p className="text-sm text-muted">{m.common.genericError}</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-muted">{c.empty}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {posts.map((p) => (
            <li key={p.id}>
              <Card className="p-4">
                <Message
                  author={p.author_name}
                  avatarStyle={p.avatar_style}
                  nameColor={p.name_color}
                  nameStyle={p.name_style}
                  createdAt={p.created_at}
                  body={p.body}
                  slip={p.slip}
                  actions={
                    p.is_own || canModerate ? (
                      <form action={p.is_own ? deletePost : moderatePost}>
                        <input type="hidden" name="postId" value={p.id} />
                        <SubmitButton
                          variant="ghost"
                          className="h-auto px-2 py-1 text-xs"
                          confirmMessage={p.is_own ? c.deleteConfirm : c.moderateConfirm}
                        >
                          {p.is_own ? c.delete : c.moderate}
                        </SubmitButton>
                      </form>
                    ) : null
                  }
                />
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Ultimi commenti scritti sotto le partite, con il collegamento alla partita. */
async function MatchesChat() {
  const m = getMessages();
  const comments = await listRecentComments(50);
  if (comments === null) return <p className="text-sm text-muted">{m.common.genericError}</p>;
  if (comments.length === 0)
    return <p className="text-sm text-muted">{m.community.emptyMatches}</p>;
  return (
    <ol className="flex max-w-2xl flex-col gap-3">
      {comments.map((c) => (
        <li key={c.id}>
          <Card className="p-4">
            <Message
              author={c.author_name}
              avatarStyle={c.avatar_style}
              nameColor={c.name_color}
              nameStyle={c.name_style}
              createdAt={c.created_at}
              body={c.body}
              context={
                <Link
                  href={`/match-center/${c.match_id}#comments`}
                  className="font-medium text-positive-strong hover:underline"
                >
                  {c.home_team} – {c.away_team}
                </Link>
              }
            />
          </Card>
        </li>
      ))}
    </ol>
  );
}
