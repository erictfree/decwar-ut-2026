/**
 * STATUS command (`isaydo` index 23) — the read-only demonstrator command.
 *
 * Source: `DECWAR.FOR:3841–3955` (subroutine STATUS); labels from `MSG.MAC`; OCOND from
 * `WARMAC.MAC:2483–2503`. Classification: Preserve exactly (output is product text).
 *
 * No-argument STATUS prints the stardate then Condition, Location, Torpedoes, Energy,
 * Damage, Shields, Radio (the synthetic "C L T E D S R" item list). With explicit item
 * args (e.g. `STATUS Energy Shields`) the stardate is skipped and only those items appear.
 *
 * Verbosity (`oflg`) selects: SHORT (one line, single-letter label + tight value, ' '
 * separators); MEDIUM (one item per line, 7-char fixed-width label like "SDate  ");
 * LONG (one item per line, TAB-positioned labels — value column lands at the next 8-col
 * tab stop in the terminal). Output writes through the cursor-tracking `out()` seam so
 * `session.hcpos` advances on every char, matching the source's `ochr.` cursor state.
 */
import { CRLF, out, space, crlf } from "../render/output.ts";
import {
  odec, oflt, osflt, ocond, prlocAbsShort,
} from "../render/format.ts";
import {
  STAT2L, STAT2M, STAT3L, STAT3M, STAT05,
  STAT6L, STAT6M, STAT7L, STAT7M, STAT8L, STAT8M,
  STAT9L, STAT9M, STA10L, STA10M, STAT11,
  RADIO1, RADIO3, SYNTAX,
} from "../render/strings.ts";
import { equal } from "../parser/match.ts";
import { KCRIT, DEV, OFLG } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

const FULL_REPORT = ["C", "L", "T", "E", "D", "S", "R"];

/**
 * Render the STATUS output for the session's ship via the cursor-tracking `out()` seam.
 * `items` null ⇒ full no-arg report (with the stardate prefix); a non-null list emits just
 * those items (matching source line 3848's `if (typlst(stoken) .ne. KEOL) goto 900`).
 */
export function renderStatus(
  state: GameState,
  session: Session,
  items: string[] | null,
): void {
  const ship = state.ships[session.who];
  const dev = state.devices[session.who];
  if (!ship || !dev) { crlf(session); return; } // not in game (shouldn't happen post-activate)

  const short = session.oflg === OFLG.SHORT;
  const long = session.oflg === OFLG.LONG;
  const obit = short ? 0 : 4;
  // Source 3846: every STATUS call starts with a CRLF.
  crlf(session);

  let list = items;

  if (list === null) {
    // Stardate line (only on the full no-arg report). Source 3849–3856.
    if (short) out(session, "SD");
    else if (long) out(session, STAT2L);
    else out(session, STAT2M);
    out(session, odec(ship.turns, obit));
    if (short) space(session); // source 3855: short separator
    else crlf(session);          // source 3856: medium/long → CRLF
    list = FULL_REPORT;
  }

  for (const tok of list) {
    if (equal(tok, "SHIELDS")) {
      // Source 1000–1400.
      if (short) out(session, "SH");
      else if (long) out(session, STAT3L);
      else out(session, STAT3M);
      out(session, osflt(ship.shieldCond * ship.shieldPct, obit, short));
      if (!short) out(session, "%");
      space(session); // source 3890
      if (short) continue;
      out(session, oflt(ship.shieldPct * 25, obit, short));
      out(session, STAT05);
      crlf(session); // source 3894
    } else if (equal(tok, "LOCATION")) {
      // Source 1500–2000.
      if (short) { /* short jumps straight to value (source 1500 KALF→1800) */ }
      else if (long) out(session, STAT6L);
      else out(session, STAT6M);
      out(session, prlocAbsShort(ship.vPos, ship.hPos));
      if (short) space(session); else crlf(session);
    } else if (equal(tok, "CONDITION")) {
      // Source 2100–2600.
      if (short) { /* short jumps to OCOND directly */ }
      else if (long) out(session, STAT7L);
      else out(session, STAT7M);
      out(session, ocond(ship.condition, (state.docked[session.who] ?? 0) < 0, short));
      if (short) space(session); else crlf(session);
    } else if (equal(tok, "TORPEDO")) {
      // Source 2700–3300.
      if (short) out(session, "T");
      else if (long) out(session, STAT8L);
      else out(session, STAT8M);
      out(session, odec(ship.torps, obit));
      if (short) space(session); else crlf(session);
    } else if (equal(tok, "ENERGY")) {
      // Source 3400–4000.
      if (short) out(session, "E");
      else if (long) out(session, STAT9L);
      else out(session, STAT9M);
      out(session, oflt(ship.energy, obit, short));
      if (short) space(session); else crlf(session);
    } else if (equal(tok, "DAMAGE")) {
      // Source 4100–4700.
      if (short) out(session, "D");
      else if (long) out(session, STA10L);
      else out(session, STA10M);
      out(session, oflt(ship.damage, obit, short));
      if (short) space(session); else crlf(session);
    } else if (equal(tok, "RADIO")) {
      // Source 4800–5600.
      if (short) out(session, "R");
      else if (long) out(session, RADIO1);
      else out(session, RADIO3);
      if ((dev[DEV.KDRAD] ?? 0) >= KCRIT) {
        out(session, STAT11); // 'damaged'
      } else if (((state.bits[session.who] ?? 0) & state.nomsg) !== 0) {
        out(session, "Off");
      } else {
        out(session, "On");
      }
      if (short) space(session); else crlf(session);
    } else {
      out(session, SYNTAX);
      crlf(session);
    }
  }

  // Source 3871–3873: short mode emits a CRLF on the first non-KALF token (end of list).
  if (short) crlf(session);
  void CRLF;
}
