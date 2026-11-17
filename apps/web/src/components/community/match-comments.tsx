import Link from "next/link";
import { highestRole } from "@predictra/shared-types";
import { COMMENT_MAX_LENGTH } from "@predictra/shared-types";
import {
  addComment,
  deleteComment,
  moderateComment,
} from "@/app/(app)/match-center/[id]/comment-actions";
import { StyledName } from "@/components/community/styled-name";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, CardTitle, Label } from "@/components/ui/primitives";
import { requireUser } from "@/lib/auth/dal";
import { isAdult, todayInRome } from "@/lib/community/community";
import { getOwnCommunityProfile, listMatchComments } from "@/lib/community/queries";
import { formatDateTime, getMessages } from "@/lib/i18n";

/**
 * Commenti sotto la partita (ADR 0058): li leggono e li scrivono solo gli utenti che hanno
 * dichiarato almeno 18 anni. Agli altri si spiega come sbloccarli.
 */
export async function MatchComments({ matchId }: { matchId: number }) {
  const user = await requireUser();
  const m = getMessages().comments;
  const own = await getOwnCommunityProfile(user.id);

  if (!isAdult(own.birthDate, todayInRome())) {
    return (
      <Card className="mt-4">
        <CardTitle>{m.title}</CardTitle>
        <p className="mt-2 text-sm text-muted">{own.birthDate ? m.underAge : m.locked}</p>
        {!own.birthDate ? (
          <Link
            href="/settings/preferences#birthday"
            className="mt-3 inline-block text-sm font-medium text-positive-strong underline underline-offset-2"
          >
            {m.unlock}
          </Link>
        ) : null}
      </Card>
    );
  }

  const comments = await listMatchComments(matchId);
  const role = highestRole(user.roles);
  const canModerate = (role === "ADMIN" || role === "SUPER_ADMIN") && user.aal2;

  return (
    <Card className="mt-4">
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
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm">
                  <StyledName name={c.author_name} color={c.name_color} style={c.name_style} />
                  <span className="ml-2 text-xs text-subtle">{formatDateTime(c.created_at)}</span>
                </p>
                {c.is_own || canModerate ? (
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
                ) : null}
              </div>
              <p className="mt-1 whitespace-pre-line break-words text-sm text-fg">{c.body}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
