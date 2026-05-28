/**
 * OUTMSG — render a queued radio message for the recipient.
 *
 * Source: `DECWAR.FOR:2588–2612`; analysis Deliverable #9 §4.2. Classification: Preserve exactly.
 *
 * "Message from <sender> to <recipients>" then the body. A message from a player whose sender
 * bit is in this recipient's `gagmsg` is suppressed (the gag filter). Recipients are listed
 * using the 2-char scan tags from `names(i, 3)` (e.g. " E F I", matching the source's
 * `call out2c (names(i, 3))` at line 2605); the sender keeps its full odisp-style name.
 */
import { CRLF } from "../render/output.ts";
import { MESS01, MESS02, OBJ_NAMES, SHIP_NAMES, SHIP_TAGS } from "../render/strings.ts";
import { KNPLAY, DX } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";
import type { RadioMessage } from "./messageBus.ts";

function senderName(dispfr: number): string {
  const cls = Math.trunc(dispfr / 100);
  const idx = dispfr % 100;
  if (cls === DX.FSHP || cls === DX.ESHP) return SHIP_NAMES[idx] ?? `ship ${idx}`;
  return OBJ_NAMES[cls] ?? "?";
}

/** Render one radio message for `session`; returns "" if the sender is gagged by this recipient. */
export function renderMsg(state: GameState, session: Session, msg: RadioMessage): string {
  if (msg.dispfr !== 0) {
    const senderBit = state.bits[msg.dispfr % 100] ?? 0;
    if ((session.gagmsg & senderBit) !== 0) return ""; // gagged
  }
  let s = `${MESS01}${senderName(msg.dispfr)} ${MESS02}`;
  for (let i = 1; i <= KNPLAY; i++) {
    if ((msg.recipients & (1 << (i - 1))) !== 0) s += ` ${SHIP_TAGS[i] ?? ""}`;
  }
  return `${s}${CRLF}${msg.body}${CRLF}`;
}
