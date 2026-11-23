import { StyledName } from "@/components/community/styled-name";
import { StatCard } from "@/components/dashboard/cards";
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
    <StatCard href="/community" title={c.title}>
      {general === null && slips === null ? (
        <p className="mt-2 text-sm text-muted">{m.dashboard.noData}</p>
      ) : posts.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{c.homeEmpty}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {posts.map((p) => (
            <li key={p.id} className="flex items-start gap-2.5">
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
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs font-medium text-positive-strong">{c.homeOpen}</p>
    </StatCard>
  );
}
