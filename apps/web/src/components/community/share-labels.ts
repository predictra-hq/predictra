import type { SharedSlip } from "@predictra/shared-types";
import { getMessages } from "@/lib/i18n";
import { formatOdds, formatPercent } from "@/lib/odds/format";
import { sharedSlipText } from "@/lib/community/slip";
import type { ShareSlipLabels } from "./share-slip";

/** Testi del pulsante Condividi, preparati sul server. */
export function shareSlipLabels(): ShareSlipLabels {
  const m = getMessages().community;
  return {
    share: m.share,
    toCommunity: m.toCommunity,
    toApps: m.toApps,
    messagePlaceholder: m.sharePlaceholder,
    send: m.shareSend,
    copied: m.copied,
    seeChat: m.seeChat,
  };
}

/** JSON e testo per le altre app di una schedina da condividere. */
export function shareProps(slip: SharedSlip): {
  slip: string;
  text: string;
  labels: ShareSlipLabels;
} {
  const m = getMessages().community;
  return {
    slip: JSON.stringify(slip),
    text: sharedSlipText(
      slip,
      { total: m.textTotal, probability: m.textProbability },
      formatOdds,
      (n) => formatPercent(n, 0),
    ),
    labels: shareSlipLabels(),
  };
}
