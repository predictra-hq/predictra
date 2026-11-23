import { highestRole } from "@predictra/shared-types";
import { COMMENT_MAX_LENGTH } from "@predictra/shared-types";
import {
  addComment,
  deleteComment,
  moderateComment,
} from "@/app/(app)/match-center/[id]/comment-actions";
import { Message } from "@/components/community/message";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, CardTitle, Label } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { listMatchComments } from "@/lib/community/queries";
import { getMessages } from "@/lib/i18n";

/**
 * Commenti sotto la partita (ADR 0058, 0064): li leggono e li scrivono tutti gli iscritti
 * attivi, con il nome, lo stile e l'immagine scelti nel Profilo.
 */
export async function MatchComments({ matchId }: { matchId: number }) {
  const user = await requireUser();
  const m = getMessages().comments;

  const comments = await listMatchComments(matchId);
  const role = highestRole(user.roles);
  const canModerate = (role === "ADMIN" || role === "SUPER_ADMIN") && user.aal2;

  return (
    <Card id="comments" className="mt-4 scroll-mt-24">
      <CardTitle>{m.title}</CardTitle>
      <p className="mt-1 text-xs text-subtle">{m.rules}</p>

      <ActionForm action={addComment} className="mt-4">
        <input type="hidden" name="matchId" value={matchId} />
        <Label htmlFor="comment-body" className="sr-only">
          {m.label}
        </Label>
        <textarea
          id="comment-body"
          name="body"
          required
          maxLength={COMMENT_MAX_LENGTH}
          rows={3}
          placeholder={m.placeholder}
          className="w-full rounded-xl border border-input bg-bg px-3 py-2.5 text-sm text-fg placeholder:text-subtle focus:border-positive focus:outline-none focus:ring-2 focus:ring-positive/30"
        />
        <SubmitButton>{m.publish}</SubmitButton>
      </ActionForm>

      {comments === null ? (
        <p className="mt-4 text-sm text-muted">{getMessages().common.genericError}</p>
      ) : comments.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{m.empty}</p>
      ) : (
        <ol className="mt-4 flex flex-col divide-y divide-border">
          {comments.map((c) => (
            <li key={c.id} className="py-3">
              <Message
                author={c.author_name}
                avatarStyle={c.avatar_style}
                nameColor={c.name_color}
                nameStyle={c.name_style}
                createdAt={c.created_at}
                body={c.body}
                actions={
                  c.is_own || canModerate ? (
                    <form action={c.is_own ? deleteComment : moderateComment}>
                      <input type="hidden" name="matchId" value={matchId} />
                      <input type="hidden" name="commentId" value={c.id} />
                      <SubmitButton
                        variant="ghost"
                        className="h-auto px-2 py-1 text-xs"
                        confirmMessage={c.is_own ? m.deleteConfirm : m.moderateConfirm}
                      >
                        {c.is_own ? m.delete : m.moderate}
                      </SubmitButton>
                    </form>
                  ) : null
                }
              />
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
