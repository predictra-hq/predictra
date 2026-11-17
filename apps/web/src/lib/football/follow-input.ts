/** Cosa si può seguire: una squadra o un campionato. */
export const FOLLOW_KINDS = ["team", "competition"] as const;
export type FollowKind = (typeof FOLLOW_KINDS)[number];

export interface FollowInput {
  kind: FollowKind;
  id: number;
  /** `true` per iniziare a seguire, `false` per smettere. */
  follow: boolean;
}

/** Colonna di `user_follows` per tipo. */
export const FOLLOW_COLUMN: Record<FollowKind, "team_id" | "competition_id"> = {
  team: "team_id",
  competition: "competition_id",
};

/** Legge il modulo del pulsante «Segui»; `null` se i valori non sono validi. */
export function parseFollowInput(get: (name: string) => unknown): FollowInput | null {
  const kind = get("kind");
  const id = get("id");
  const follow = get("follow");
  if (typeof kind !== "string" || !FOLLOW_KINDS.includes(kind as FollowKind)) return null;
  if (typeof id !== "string" || !/^[1-9]\d{0,14}$/.test(id)) return null;
  if (follow !== "1" && follow !== "0") return null;
  return { kind: kind as FollowKind, id: Number(id), follow: follow === "1" };
}
