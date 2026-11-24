import { StyledName } from "@/components/community/styled-name";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { listCommunityPosts } from "@/lib/community/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";

/**
 * Spogliatoio in Home (ADR 0064): gli ultimi tre messaggi delle chat Generale e Schedine,
 * con immagine e nome di chi scrive. Tutta la card porta alla chat.
 */
export async function LockerRoomCard() {
  const m = getMessages();
  const c = m.community;
  const [general, slips] = await Promise.all([
    listCommunityPosts("GENERAL", 3),
    listCommunityPosts("SLIPS", 3),
  ]);
  const posts = [...(general ?? []), ...(slips ?? [])]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 3);

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
      {general === null && slips === null ? (
        <p className="mt-2 text-sm text-muted">{m.dashboard.noData}</p>
      ) : posts.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{c.homeEmpty}</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {posts.map((p) => (
            <li key={p.id}>
              {/* Ogni messaggio porta a sé stesso nella sua chat (ADR 0070). */}
              <Link
                href={`/locker-room?c=${p.channel === "SLIPS" ? "slips" : "general"}#post-${p.id}`}
                className="-mx-2 flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2"
              >
                <UserAvatar style={p.avatar_style} name={p.author_name} className="size-7" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs">
                    <StyledName
                      name={p.author_name}
                      color={p.name_color}
                      style={p.name_style}
                      className="font-semibold"
                    />
                    <span className="ml-2 text-subtle">{formatDateTime(p.created_at)}</span>
                  </p>
                  <p className="truncate text-sm">
                    {p.slip ? `🎯 ${p.slip.title}${p.body ? ` · ${p.body}` : ""}` : p.body}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
