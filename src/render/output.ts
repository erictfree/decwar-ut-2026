/**
 * Output helpers: the CRLF terminator, the cursor-tracking write seam, the column primitives
 * (`tab`/`spaces`/`space`/`ocrl`/`crlf`), and the command prompt.
 *
 * Source: WARMAC.MAC `ochr.` 1545–1579 (hcpos/blank maintenance), `tab`/`spaces`/`space` 1960–
 * 1999, `ocrl./crlf` 2002–2019; PROMPT DECWAR.FOR:3094–3112; `comlin` MSG.MAC:38.
 * Classification: Preserve exactly. The PDP-10 `crlf` emits CR+LF; over telnet that is `\r\n`.
 *
 * The cursor model (`hcpos`, `blank`) lives on `Session`. Every printed character advances
 * `hcpos`; CR resets it (and marks `blank` so the next LF flags a blank line); LF increments
 * `blank`; BS decrements `hcpos`; TAB rounds up to the next multiple of 8 (PDP-10 hard tab).
 *
 * **Migration note:** new code should call `out(session, …)` instead of `session.io.write(…)`
 * so the cursor stays accurate. The substrate is in place; legacy direct-write call sites are
 * being migrated incrementally as they need column-alignment behavior.
 */
import { COMLIN } from "./strings.ts";
import { odec } from "./format.ts";
import { KCRIT, DEV } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

export const CRLF = "\r\n";

/**
 * Write `text` through the cursor-tracking seam. Replaces direct `session.io.write` for code
 * that cares about hcpos/blank (i.e. anything that later calls `tab`, `crlf`, or relies on the
 * blank-line suppression in `ocrl`).
 */
export function out(session: Session, text: string): void {
  for (let i = 0; i < text.length; i++) {
    advanceCursor(session, text.charCodeAt(i));
  }
  session.io.write(text);
}

/** `ochr.` per-char cursor maintenance (WARMAC.MAC 1549–1577). */
function advanceCursor(session: Session, code: number): void {
  // Printable: advance cursor.
  // Control (the source distinguishes by bit 5/6 set; high-bit ASCII ≥0x20 is "printable"):
  if (code >= 0x20) {
    session.hcpos++;
    return;
  }
  // Control char: source's `ochr.` first does aos hcpos / sos hcpos (net zero), then dispatches.
  switch (code) {
    case 0x0d: // CR
      if (session.hcpos !== 0) session.blank = -1; // next LF will be the first blank line
      session.hcpos = 0;
      return;
    case 0x0a: // LF
      session.blank++;
      return;
    case 0x08: // BS
      if (session.hcpos > 0) session.hcpos--;
      return;
    case 0x09: // TAB — PDP-10 hard tab: round to next multiple of 8
      session.hcpos = (session.hcpos + 8) & ~7;
      return;
    default:
      return; // other control chars: non-printing, hcpos unchanged
  }
}

/** TAB (WARMAC 1968–1973): pad with spaces to reach absolute column `col`. */
export function tab(session: Session, col: number): void {
  const need = col - session.hcpos;
  if (need > 0) out(session, " ".repeat(need));
}

/** SPACES (1980–1986): emit `n` spaces (no-op for n ≤ 0). */
export function spaces(session: Session, n: number): void {
  if (n > 0) out(session, " ".repeat(n));
}

/** SPACE (1994–1999): single space. */
export function space(session: Session): void {
  out(session, " ");
}

/**
 * OCRL./CRLF (2007–2019): emit CR+LF, but suppress if the previous line was already blank
 * AND we are still at the left margin (no half-line buffered) — the consecutive-blank guard.
 */
export function ocrl(session: Session): void {
  if (session.blank > 0 && session.hcpos === 0) return; // would be another blank line
  out(session, CRLF);
}

/** Force CRLF unconditionally (no blank-suppress). Used where source calls `crlf` after content. */
export function crlf(session: Session): void {
  out(session, CRLF);
}

/**
 * Render the command prompt. Normal (`prtype` 0) is the literal `Command: `. The informative
 * prompt emits warning flags in source order `nL S D E` then `> `:
 *   • `<lifesupport>L` when the life-support device is critically damaged (≥ KCRIT)
 *   • `S` when shields ≤ 10.0% or shields are down
 *   • `D` when ship damage ≥ 2000.0 (stored 20000)
 *   • `E` when ship energy ≤ 1000.0 (stored 10000, the yellow-alert threshold)
 */
export function renderPrompt(state: GameState, session: Session): string {
  if (session.prtype === 0) return COMLIN;

  const ship = state.ships[session.who];
  const dev = state.devices[session.who];
  if (!ship || !dev) return COMLIN;

  let p = "";
  if ((dev[DEV.KDLIFE] ?? 0) >= KCRIT) p += `${odec(ship.lifeSupport, 0)}L`;
  if (ship.shieldPct <= 100 || ship.shieldCond < 0) p += "S";
  if (ship.damage >= 20000) p += "D"; // KSDAM ≥ 2000.0
  if (ship.energy <= 10000) p += "E"; // KSNRGY ≤ 1000.0 (yellow alert)
  return `${p}> `;
}
