import { StyledName } from "@/components/community/styled-name";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { NameColor, NameStyle } from "@predictra/shared-types";
import { UserAvatar } from "@/components/ui/user-avatar";
import { listCommunityPosts, listRecentComments } from "@/lib/community/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";

interface Item {
  key: string;
  chat: "general" | "slips" | "matches";
  href: string;
  author: string;
  nameColor: NameColor | null;
  nameStyle: NameStyle | null;
  avatarStyle: string | null;
  createdAt: string;
  text: string;
}

/**
 * Spogliatoio in Home (ADR 0064, aggiornato il 27/11/2026): l'ultimo messaggio di ogni chat
 * (Generale, Schedine, Partite), al massimo tre, dal più recente, con il nome della chat
 * accanto. Ogni messaggio porta alla sua chat.
 */
export async function LockerRoomCard() {
  const m = getMessages();
  const c = m.community;
  const [general, slips, comments] = await Promise.all([
    listCommunityPosts("GENERAL", 1),
    listCommunityPosts("SLIPS", 1),
    listRecentComments(1),
  ]);
  const items: Item[] = [];
  for (const [chat, rows] of [
    ["general", general],
    ["slips", slips],
  ] as const) {
    const p = rows?.[0];
    if (!p) continue;
    items.push({
      key: `${chat}-${p.id}`,
      chat,
      // Ogni messaggio porta a sé stesso nella sua chat (ADR 0070).
      href: `/locker-room?c=${chat}#post-${p.id}`,
      author: p.author_name,
      nameColor: p.name_color,
      nameStyle: p.name_style,
      avatarStyle: p.avatar_style,
      createdAt: p.created_at,
      text: p.slip ? `🎯 ${p.slip.title}${p.body ? ` · ${p.body}` : ""}` : p.body,
    });
  }
  const comment = comments?.[0];
  if (comment) {
    items.push({
      key: `matches-${comment.id}`,
      chat: "matches",
      href: "/locker-room?c=matches",
      author: comment.author_name,
      nameColor: comment.name_color,
      nameStyle: comment.name_style,
      avatarStyle: comment.avatar_style,
      createdAt: comment.created_at,
      text: `${comment.home_team} – ${comment.away_team}: ${comment.body}`,
    });
  }
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const failed = general === null && slips === null && comments === null;

  return (
    <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
      <Link
        href="/locker-room"
        className="group flex items-center justify-between text-xs uppercase tracking-wide text-muted hover:text-fg"
      >
        {c.title}
        <ChevronRight
          size={16}
          aria-hidden="true"
          className="text-subtle transition-transform group-hover:translate-x-0.5"
        />
      </Link>
      {failed ? (
        <p className="mt-2 text-sm text-muted">{m.dashboard.noData}</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{c.homeEmpty}</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {items.map((p) => (
            <li key={p.key}>
              <Link
                href={p.href}
                className="-mx-2 flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2"
              >
                <UserAvatar style={p.avatarStyle} name={p.author} className="size-7" />
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-2 text-xs">
                    <StyledName
                      name={p.author}
                      color={p.nameColor}
                      style={p.nameStyle}
                      className="truncate font-semibold"
                    />
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-subtle">
                      {c.tabs[p.chat]}
                    </span>
                    <span className="shrink-0 text-subtle">{formatDateTime(p.createdAt)}</span>
                  </p>
                  <p className="truncate text-sm">{p.text}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
