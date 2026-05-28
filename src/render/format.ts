/**
 * Renderer-layer formatters — the `ODEC`/`OSDEC`/`OFLT`/`OSFLT` display wrappers, plus
 * `PRLOC` and `OCOND`.
 *
 * Source: WARMAC.MAC ONUM./OSN1-3 2236–2284 (ODEC/OSDEC), OFLT/OSFLT 2305–2337,
 * OCOND DECWAR.FOR 2483–2503; PRLOC DECWAR.FOR:3065–3084.
 *
 * `core/fixed.ts` owns the ×10 arithmetic (`whole`/`frac`); this module adds field-width
 * right-justification, sign behavior (ONUM./OSN1.), and the short-mode fraction suppression
 * the output routines apply.
 *
 * Field-width semantics (`onum.` 2210–2218): w>0 → pad to width with leading spaces (truncate
 * never happens here since the renderer is just appending strings); w=0 → free format. The
 * sign character counts toward the field width.
 */
import { whole, frac } from "../core/fixed.ts";
import type { Tenths } from "../core/fixed.ts";
import { pdist } from "../core/geometry.ts";
import { COORD, OFLG } from "../core/constants.ts";
import { CRLF } from "./output.ts";
import { COND_LONG, COND_SHORT, DOCKED_LONG, DOCKED_SHORT } from "./strings.ts";

function lpad(s: string, width: number): string {
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

/** ODEC: decimal, '-' if negative, no sign for ≥0; right-justified to `w` (0 = free). */
export function odec(n: number, w = 0): string {
  return lpad(String(n), w);
}

/** OSDEC (`osn1.`): '+' if n>0, '-' if n<0, no sign if n==0; right-justified to `w`. */
export function osdec(n: number, w = 0): string {
  const body = n > 0 ? `+${n}` : String(n); // String(-3)="-3", String(0)="0"
  return lpad(body, w);
}

/** OFLT: ×10 value as `whole.frac`, whole right-justified in `w`; short omits the fraction. */
export function oflt(t: Tenths, w: number, short: boolean): string {
  const wholeStr = lpad(String(whole(t)), w);
  return short ? wholeStr : `${wholeStr}.${frac(t)}`;
}

/**
 * OSFLT: signed ×10 value. Sign is forced (`osn2.`/`osn3.`): `t>0` → '+', `t≤0` → '-'
 * (so 0 → "-0.0", consistent with source's whole-sign dispatch). Short omits the fraction.
 */
export function osflt(t: Tenths, _w: number, short: boolean): string {
  const sign = t > 0 ? "+" : "-";
  const mag = Math.abs(t);
  return short ? `${sign}${whole(mag)}` : `${sign}${whole(mag)}.${frac(mag)}`;
}

/**
 * PRLOC — render a sector location for output.
 *
 *   call prloc(v, h, prcflg, w, prlflg, proflg)
 *
 * @param prcflg  nonzero → emit CRLF after the location
 * @param w       field width (0 = free; the abs portion uses `w`, the rel portion `w+1`
 *                to fit the sign — source line 3079)
 * @param prlflg  COORD.REL / COORD.BOTH / COORD.ABS (=== KREL/KBOTH/KABS)
 * @param proflg  OFLG.SHORT / OFLG.MEDIUM / OFLG.LONG. Medium/long prefix the abs portion
 *                with `@`; short omits it.
 *
 * Self-loc skip: if (v,h) equals the ship and `w==0`, the rel portion (and the KBOTH space
 * separator) are skipped — matches the goto-200 at 3075–3076.
 */
export function prloc(
  v: number,
  h: number,
  prcflg: number,
  w: number,
  prlflg: -1 | 0 | 1,
  proflg: -1 | 0 | 1,
  vShip: number,
  hShip: number,
): string {
  let s = "";
  if (prlflg !== COORD.REL) {
    if (proflg !== OFLG.SHORT) s += "@";
    s += `${odec(v, w)}-${odec(h, w)}`;
  }
  const selfHere = pdist(v, h, vShip, hShip) === 0;
  if (!(selfHere && w === 0)) {
    if (prlflg === COORD.BOTH) s += " ";
    if (prlflg !== COORD.ABS) {
      const tw = w === 0 ? 0 : w + 1;
      s += `${osdec(v - vShip, tw)},${osdec(h - hShip, tw)}`;
    }
  }
  if (prcflg !== 0) s += CRLF;
  return s;
}

/** STATUS's hardcoded `prloc(..., 0, 0, KABS, SHORT)` form — `v-h`. */
export function prlocAbsShort(v: number, h: number): string {
  return `${v}-${h}`;
}

/**
 * OCOND: ship condition string, prefixed with the docked marker when docked.
 * @param condCode 1=green, 2=yellow, 3=red
 * @param docked   true if the ship is docked (`docked(who) < 0`)
 * @param short    short output format (single-letter condition, "D+" docked marker)
 */
export function ocond(condCode: number, docked: boolean, short: boolean): string {
  const idx = condCode - 1;
  const cond = short ? (COND_SHORT[idx] ?? "?") : (COND_LONG[idx] ?? "?");
  const dock = docked ? (short ? DOCKED_SHORT : DOCKED_LONG) : "";
  return `${dock}${cond}`;
}
