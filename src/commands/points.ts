// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * POINTS — itemized scoring breakdown (8 categories × up-to-4 columns).
 *
 * Source: `DECWAR.FOR:2880–3033`; strings `MSG.MAC:209–247`; categories `tpoint` &
 * `KNPOIN=8`. Classification: Preserve semantically.
 *
 * Columns are toggled by flags: `iflg` (the calling player's own scores — "ME"/"I", in-game
 * only), `fflg` (FEDERATION/HUMANS), `eflg` (EMPIRE/KLINGONS), `rflg` (ROMULANS, gated on
 * `romopt`). No keyword → `iflg` (in-game) or all three teams (pre-game). ALL turns on
 * everything. Unknown keywords → `poin04` "Incorrect input, POINTS aborted."
 *
 * Layout uses the source's `tab(N)` cursor primitives via `render/output.ts`:
 *   • Header start column: `tab(14)` short, `tab(24)` medium, `tab(31)` long.
 *   • Per-category row long-mode suffix at col 26: `tab(26)` for items with no flat point
 *     value, else the `poin19–23` " (value)" annotation.
 *   • Total / # of ships / Pts-per-player / Pts-per-stardate rows: `tab(26)` (or `tab(24)`
 *     for # of ships) in long mode before the column block.
 *
 * Pre-game POINTS is wired later with the rest of the pre-game lobby (Phase F).
 */
import { equal } from "../parser/match.ts";
import { CRLF, out, tab, space, spaces, crlf } from "../render/output.ts";
import { oflt, odec } from "../render/format.ts";
import {
  FEDERA, EMPIRE, ROMULA,
  POI03L, POI03S, POIN04, POI05L, POI05S, POI06L, POI06S, POI07L, POI07S,
  POI11L, POI11S, POI12L, POI12S, POI13L, POI13S, POI14L, POI14S,
  POI15L, POI15S, POI16L, POI16S, POI17L, POI17S, POI18L, POI18S,
  POIN19, POIN20, POIN21, POIN22, POIN23,
} from "../render/strings.ts";
import { KNPOIN, TOK, OFLG } from "../core/constants.ts";
import { SHIP_NAMES } from "../render/strings.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

export function points(state: GameState, session: Session): void {
  const t = session.tokens;
  const short = session.oflg === OFLG.SHORT;
  const long = session.oflg === OFLG.LONG;
  const who = session.who; // ≠0 in-game (only path implemented)
  let iflg = false, fflg = false, eflg = false, rflg = false;

  if (t.ntok <= 1) {
    if (who !== 0) iflg = true; // in-game default: just "me"
    else { fflg = true; eflg = true; rflg = true; } // pre-game default (unused until Phase F)
  } else {
    let bad = false;
    for (let i = 2; i <= t.ntok && !bad; i++) {
      if (t.type[i] !== TOK.KALF) break;
      const k = t.text[i] ?? "";
      if ((equal(k, "ME") !== 0 || equal(k, "I") !== 0) && who !== 0) iflg = true;
      else if (equal(k, FEDERA) !== 0 || equal(k, "HUMANS") !== 0) fflg = true;
      else if (equal(k, "EMPIRE") !== 0 || equal(k, "KLINGONS") !== 0) eflg = true;
      else if (equal(k, "ROMULANS") !== 0) rflg = true;
      else if (equal(k, "ALL") !== 0) { fflg = true; eflg = true; rflg = true; if (who !== 0) iflg = true; }
      else bad = true;
    }
    if (bad) { session.io.write(`${CRLF}${POIN04}${CRLF}`); return; }
  }
  if (!state.romopt) rflg = false;
  if (!(iflg || fflg || eflg || rflg)) { session.io.write(`${CRLF}${POIN04}${CRLF}`); return; }

  // ── Per-item suffix table (built here to keep POIN23 import local-explicit) ───────────────
  // i=5 → poin23 " (1000)" (KPBBAS, bases built).
  const suffix = (i: number): string | null => {
    if (i === 1 || i === 3) return null;             // tab(26)
    if (i === 2 || i === 6) return POIN22;           // +500
    if (i === 4) return POIN21;                      // +100
    if (i === 5) return POIN23;                     // +1000 (bases built)
    if (i === 7) return POIN20;                      // -50
    if (i === 8) return POIN19;                      // -100
    return null;
  };

  // ── Header (source 2921–2940) ─────────────────────────────────────────────────────────────
  crlf(session);
  tab(session, short ? 14 : long ? 31 : 24);
  if (iflg) {
    space(session);
    out(session, (SHIP_NAMES[who] ?? "ME").padEnd(10)); // out2w → 10-char name
    if (!short) out(session, "  ");
  }
  if (fflg) {
    out(session, FEDERA); // "Federation" (10 chars)
    space(session);
    if (!short) out(session, "  ");
  }
  if (eflg) {
    out(session, EMPIRE); // "    Empire" (10 chars, right-padded to col)
    space(session);
    if (!short) out(session, "  ");
  }
  if (rflg) {
    out(session, ROMULA); // "  Romulans"
  }
  crlf(session);

  // ── Itemized scoring (source 2942–2992) ───────────────────────────────────────────────────
  const labels: readonly [string, string][] = [
    [POI11S, POI11L], [POI12S, POI12L], [POI13S, POI13L], [POI14S, POI14L],
    [POI15S, POI15L], [POI16S, POI16L], [POI17S, POI17L], [POI18S, POI18L],
  ];
  const totals: [number, number, number, number] = [0, 0, 0, 0];
  const colVal = (i: number): [number, number, number, number] => [
    state.score[i]?.[who] ?? 0,
    state.tmscor[1]?.[i] ?? 0,
    state.tmscor[2]?.[i] ?? 0,
    state.romulan.score[i] ?? 0,
  ];

  for (let i = 1; i <= KNPOIN; i++) {
    const [me, fed, emp, rom] = colVal(i);
    const any =
      (iflg && me !== 0) || (fflg && fed !== 0) || (eflg && emp !== 0) || (rflg && rom !== 0);
    if (!any) continue; // matches source: skip categories where every selected column is 0
    const lbl = labels[i - 1] ?? ["", ""];
    out(session, short ? lbl[0] : lbl[1]);
    if (long) {
      const sfx = suffix(i);
      if (sfx === null) tab(session, 26);
      else out(session, sfx);
    }
    if (iflg) { out(session, oflt(me, 11, short)); totals[0] += me; }
    if (fflg) { out(session, oflt(fed, 11, short)); totals[1] += fed; }
    if (eflg) { out(session, oflt(emp, 11, short)); totals[2] += emp; }
    if (rflg) { out(session, oflt(rom, 11, short)); totals[3] += rom; }
    crlf(session);
  }

  // ── Total row (source 2994–3002) ──────────────────────────────────────────────────────────
  out(session, short ? POI03S : POI03L);
  if (long) tab(session, 26);
  if (iflg) out(session, oflt(totals[0], 11, short));
  if (fflg) out(session, oflt(totals[1], 11, short));
  if (eflg) out(session, oflt(totals[2], 11, short));
  if (rflg) out(session, oflt(totals[3], 11, short));
  crlf(session);

  // ── # of ships + Pts/player (source 3004–3022; team-only) ─────────────────────────────────
  if (fflg || eflg || rflg) {
    out(session, short ? POI07S : POI07L);
    if (long) tab(session, 24); // source 3008 uses tab(24) here, not 26
    const ow = short ? 11 : 13;
    if (iflg) spaces(session, ow);
    if (fflg) out(session, odec(state.numshp[1] ?? 0, ow));
    if (eflg) out(session, odec(state.numshp[2] ?? 0, ow));
    if (rflg) out(session, odec(state.romulan.numSpawned, ow));
    // (source omits crlf here — poi05S/L starts with its own newline; we add it explicitly)
    crlf(session);

    const safeDiv = (n: number, d: number): number => (d === 0 ? 0 : Math.trunc(n / d));
    out(session, short ? POI05S : POI05L);
    if (long) tab(session, 26);
    if (iflg) spaces(session, ow);
    if (fflg) out(session, oflt(safeDiv(totals[1], state.numshp[1] ?? 0), 11, short));
    if (eflg) out(session, oflt(safeDiv(totals[2], state.numshp[2] ?? 0), 11, short));
    if (rflg) out(session, oflt(safeDiv(totals[3], state.romulan.numSpawned), 11, short));
    crlf(session);
  }

  // ── Pts / stardate (always; source 4000–4032) ─────────────────────────────────────────────
  const safeDiv = (n: number, d: number): number => (d === 0 ? 0 : Math.trunc(n / d));
  out(session, short ? POI06S : POI06L);
  if (long) tab(session, 26);
  if (iflg) out(session, oflt(safeDiv(totals[0], state.ships[who]?.turns ?? 0), 11, short));
  if (fflg) out(session, oflt(safeDiv(totals[1], state.tmturn[1] ?? 0), 11, short));
  if (eflg) out(session, oflt(safeDiv(totals[2], state.tmturn[2] ?? 0), 11, short));
  if (rflg) out(session, oflt(safeDiv(totals[3], state.tmturn[3] ?? 0), 11, short));
  crlf(session);
}
