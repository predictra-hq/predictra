import Link from "next/link";
import {
  deleteNotifications,
  markNotificationsRead,
} from "@/app/(app)/dashboard/notification-actions";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { listMyNotifications } from "@/lib/agent/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";
import { orFallback } from "@/lib/log";

const SEVERITY_TONE = { info: "neutral", warning: "warning", error: "negative" } as const;

/**
 * Notifiche in dashboard (M7 B3). Solo le proprie (RLS), si possono segnare come lette ed
 * eliminare (ADR 0071); la piattaforma non invia email (ADR 0008). I link sono solo percorsi interni (vincolo in tabella).
 */
export async function NotificationsCard() {
  const a = getMessages().agent;
  const data = await listMyNotifications().catch(orFallback("agent/notifications-card #1", null));
  // Nessuna notifica: il riquadro non compare.
  if (!data || data.items.length === 0) return null;
  const { items, unread } = data;

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>
          {a.notificationsTitle}
          {unread > 0 ? (
            <Badge tone="warning" className="ml-2 align-middle">
              {unread} {a.unread}
            </Badge>
          ) : null}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {unread > 0 ? (
            <ActionForm action={markNotificationsRead} className="flex items-center gap-2">
              <SubmitButton variant="secondary" className="h-8 text-xs">
                {a.markAllRead}
              </SubmitButton>
            </ActionForm>
          ) : null}
          {items.some((n) => n.read_at) ? (
            <ActionForm action={deleteNotifications} className="flex items-center gap-2">
              <SubmitButton variant="ghost" className="h-8 text-xs">
                {a.deleteRead}
              </SubmitButton>
            </ActionForm>
          ) : null}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{a.notificationsEmpty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {items.map((n) => (
            <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className={n.read_at ? "text-muted" : undefined}>
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <Badge tone={SEVERITY_TONE[n.severity]}>{a.severity[n.severity]}</Badge>
                  {n.title}
                </p>
                {n.body ? <p className="mt-1 text-sm text-muted">{n.body}</p> : null}
                <p className="mt-1 text-xs text-subtle">
                  {formatDateTime(n.created_at)}
                  {n.link ? (
                    <>
                      {" · "}
                      <Link href={n.link} className="underline">
                        {a.open}
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {n.read_at ? null : (
                  <ActionForm action={markNotificationsRead} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={n.id} />
                    <SubmitButton variant="ghost" className="h-8 text-xs">
                      {a.markRead}
                    </SubmitButton>
                  </ActionForm>
                )}
                <ActionForm action={deleteNotifications} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={n.id} />
                  <SubmitButton variant="ghost" className="h-8 text-xs">
                    {a.deleteNotification}
                  </SubmitButton>
                </ActionForm>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
