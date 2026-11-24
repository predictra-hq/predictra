import type { Metadata } from "next";
import Link from "next/link";
import { highestRole, type CommunityChannel } from "@predictra/shared-types";
import { ChatBubble, ChatThread, Reactions } from "@/components/community/chat";
import { ChatComposer } from "@/components/community/chat-composer";
import { PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { listCommunityPosts, listRecentComments, listSharedResults } from "@/lib/community/queries";
import { sharedMatchIds, sharedOutcome } from "@/lib/community/slip";
import { settle } from "@/lib/certainties/logic";
import { getMessages } from "@/lib/i18n";
import { deletePost, moderatePost, postMessage, toggleReaction } from "./actions";

export const metadata: Metadata = { title: "Spogliatoio" };

const TABS = ["general", "slips", "matches"] as const;
type Tab = (typeof TABS)[number];
const CHANNEL: Record<Exclude<Tab, "matches">, CommunityChannel> = {
  general: "GENERAL",
  slips: "SLIPS",
};

/**
 * Spogliatoio (ADR 0064, 0065): tre chat per tutti gli iscritti, come nelle app di
 * messaggi. Generale per parlare di tutto, Schedine per condividere e commentare le
 * schedine, Partite con gli ultimi commenti scritti sotto le partite. I messaggi stanno
 * sopra, il più recente in basso; si scrive nel campo in fondo.
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
      <nav aria-label={c.title} className="tab-strip mb-3">
        {TABS.map((t) => (
          <Link key={t} href={`/locker-room?c=${t}`} aria-current={t === tab ? "page" : undefined}>
            {c.tabs[t]}
          </Link>
        ))}
      </nav>

      {tab === "matches" ? (
        <MatchesChat />
      ) : (
        <Chat channel={CHANNEL[tab]} canModerate={canModerate} />
      )}
      <p className="mt-3 max-w-3xl text-xs text-subtle">{c.rules}</p>
    </>
  );
}

async function Chat({ channel, canModerate }: { channel: CommunityChannel; canModerate: boolean }) {
  const m = getMessages();
  const c = m.community;
  const posts = await listCommunityPosts(channel);
  // Esito delle schedine condivise dai risultati delle partite (ADR 0070).
  const results = await listSharedResults(sharedMatchIds((posts ?? []).map((p) => p.slip)));
  return (
    <ChatThread
      label={c.title}
      empty={posts === null ? m.common.genericError : posts.length === 0 ? c.empty : null}
      composer={
        channel === "SLIPS" ? (
          // Nella chat Schedine solo schedine: si condividono dalle pagine delle schedine.
          <p className="px-2 py-2 text-center text-xs text-muted">
            {c.slipsComposer}{" "}
            <Link href="/bet-builder" className="font-medium text-positive-strong hover:underline">
              {m.nav.betBuilder} →
            </Link>
          </p>
        ) : (
          <ChatComposer
            action={postMessage}
            hidden={{ channel }}
            placeholder={c.placeholder}
            sendLabel={c.publish}
          />
        )
      }
    >
      {(posts ?? []).map((p) => (
        <ChatBubble
          key={p.id}
          own={p.is_own}
          author={p.author_name}
          avatarStyle={p.avatar_style}
          nameColor={p.name_color}
          nameStyle={p.name_style}
          createdAt={p.created_at}
          body={p.body}
          slip={p.slip}
          anchor={`post-${p.id}`}
          slipResult={p.slip ? sharedOutcome(p.slip, results, settle as never) : undefined}
          reactions={
            <Reactions
              postId={p.id}
              reactions={p.reactions ?? []}
              action={toggleReaction}
              labels={{ react: c.react, reactWith: c.reactWith }}
            />
          }
          actions={
            p.is_own || canModerate ? (
              <form action={p.is_own ? deletePost : moderatePost}>
                <input type="hidden" name="postId" value={p.id} />
                <button
                  type="submit"
                  className="cursor-pointer text-[11px] text-subtle underline-offset-2 hover:text-negative-strong hover:underline"
                >
                  {p.is_own ? c.delete : c.moderate}
                </button>
              </form>
            ) : null
          }
        />
      ))}
    </ChatThread>
  );
}

/** Ultimi commenti scritti sotto le partite: per rispondere si apre la partita. */
async function MatchesChat() {
  const m = getMessages();
  const c = m.community;
  const comments = await listRecentComments(50);
  return (
    <ChatThread
      label={c.tabs.matches}
      empty={
        comments === null ? m.common.genericError : comments.length === 0 ? c.emptyMatches : null
      }
      composer={<p className="px-2 py-2 text-center text-xs text-muted">{c.tabHints.matches}</p>}
    >
      {(comments ?? []).map((x) => (
        <ChatBubble
          key={x.id}
          own={x.is_own}
          author={x.author_name}
          avatarStyle={x.avatar_style}
          nameColor={x.name_color}
          nameStyle={x.name_style}
          createdAt={x.created_at}
          body={x.body}
          context={
            <Link
              href={`/match-center/${x.match_id}#comments`}
              className="font-medium text-positive-strong hover:underline"
            >
              {x.home_team} – {x.away_team}
            </Link>
          }
        />
      ))}
    </ChatThread>
  );
}
