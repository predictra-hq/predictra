import type { ReactNode } from "react";
import { getMessages } from "@/lib/i18n";
import { RowLimitClient } from "./row-limit";

/** Limite di righe per le tabelle, con i testi già pronti (componente server). */
export function Limited({
  total,
  limit = 10,
  children,
}: {
  total: number;
  limit?: 5 | 10;
  children: ReactNode;
}) {
  const m = getMessages().common;
  return (
    <RowLimitClient total={total} limit={limit} more={m.showMoreRows} less={m.showLessRows}>
      {children}
    </RowLimitClient>
  );
}
