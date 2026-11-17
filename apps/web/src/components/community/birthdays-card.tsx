import { Cake } from "lucide-react";
import { StyledName } from "@/components/community/styled-name";
import { listBirthdaysToday } from "@/lib/community/queries";
import { getMessages } from "@/lib/i18n";

/** Home: chi compie gli anni oggi, solo tra chi lo ha reso visibile. Senza nessuno non compare. */
export async function BirthdaysCard() {
  const rows = await listBirthdaysToday();
  if (rows.length === 0) return null;
  const m = getMessages().comments;
  return (
    <p className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3 text-sm">
      <Cake size={18} aria-hidden="true" className="text-positive" />
      <span className="text-muted">{m.birthdaysToday}</span>
      {rows.map((r, i) => (
        <span key={`${r.display_name}-${i}`}>
          <StyledName name={r.display_name} color={r.name_color} style={r.name_style} />
          {i < rows.length - 1 ? "," : ""}
        </span>
      ))}
    </p>
  );
}
