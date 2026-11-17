import { getMessages } from "@/lib/i18n";
import type { StakeBoxLabels } from "./stake-box";

/** Testi della puntata modificabile, preparati sul server. */
export function stakeBoxLabels(): StakeBoxLabels {
  const m = getMessages().betBuilder;
  return {
    stake: m.stakeBox.stake,
    odds: m.stakeBox.odds,
    oddsHint: m.stakeBox.oddsHint,
    win: m.stakeBox.win,
    register: m.bollette.register,
    registerHint: m.bollette.registerHint,
  };
}
