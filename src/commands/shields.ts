// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * SHIELDS — raise/lower deflector shields and transfer energy between ship and shields.
 *
 * Source: `DECWAR.FOR:3722–3786` (subroutine SHIELD); strings `MSG.MAC:280–289`.
 * Classification: Preserve exactly. Zero RNG draws.
 *
 * Three sub-flows selected by token 2 (or by an interactive prompt):
 *   • UP        — refused if `shpdam(who,KDSHLD) > KCRIT` (strictly greater, per source 3772).
 *                 Else `shieldCond=+1`, ship energy `-= 1000` (100 raw units), warn `shld07`
 *                 if energy ended at 0. If `trstat[who]≠0` the source cuts the tractor beam
 *                 here (the bidirectional clear; the iwhat=14 notification is deferred until
 *                 TRACTOR lands its `trcoff` helper).
 *   • DOWN      — `shieldCond=-1`. No energy cost. No KCRIT gate.
 *   • TRANSFER  — signed energy amount (positive = ship→shields, negative = shields→ship).
 *                 Conversion ratio: 25 (×10) ship-energy units = 1 (×10) shield-pct unit
 *                 (source 3751/3763; the same 25:1 in raw units). Caps both directions
 *                 (shield 100%, ship energy 50000 ×10). A positive transfer that would zero
 *                 ship energy prompts `shld03` "Confirm?" and only proceeds on YES (the only
 *                 await — at the read seam, before any mutation).
 *
 * Subtleties preserved:
 *   • `shieldPct ≤ 0` after a transfer forces `shieldCond = -1` (source 3766).
 *   • Ship condition GREEN/YELLOW is updated by TRANSFER only — UP/DOWN don't touch it
 *     (source has these updates inside the 700 branch only).
 *   • The "amount on the line" path (`SHIELD TRANSFER 500`) reads `vallst(3)*10`; the
 *     bare-subcmd path (`SHIELD TRANSFER`) prompts via `shld02`, then `vallst(1)*10`.
 *     `SHIELD 500` (TRANSFER implied) reads `vallst(2)*10`.
 */
import { tokenize } from "../parser/tokenizer.ts";
import { equal } from "../parser/match.ts";
import { CRLF } from "../render/output.ts";
import {
  SHLD01, SHLD02, SHLD03, SHLD04, SHLD05, SHLD06, SHLD07, SHLD08, SHLD09,
} from "../render/strings.ts";
import {
  TOK, KCRIT, COND, SHIELD, DEV, ENERGY_CAP, SHIELD_CAP, KCMDTM,
} from "../core/constants.ts";
import { trcoff } from "./tractor.ts";
import type { GameState } from "../core/state.ts";
import type { Session, TokenBuffers } from "../core/session.ts";

async function readArgLine(session: Session): Promise<string | null> {
  let line: string | null = null;
  while (line === null && !session.hungup) line = await session.io.readCommandLine(KCMDTM);
  return session.hungup ? null : line;
}

export async function shields(state: GameState, session: Session): Promise<void> {
  const ship = state.ships[session.who];
  if (!ship) return;
  const dev = state.devices[session.who]!;
  session.io.write(CRLF);

  // ── pick sub-command (UP/DOWN/TRANSFER), or prompt ────────────────────────────────────────
  const t0 = session.tokens;
  let sub = "";
  let amountTok2 = false; // SHIELD 500 → amount in token 2 (TRANSFER implied)
  let amountTok3 = false; // SHIELD TRANSFER 500 → amount in token 3
  if (t0.type[2] === TOK.KALF) {
    const k = t0.text[2] ?? "";
    if (equal(k, "TRANSFER") !== 0) { sub = "TRANSFER"; if (t0.type[3] === TOK.KINT) amountTok3 = true; }
    else if (equal(k, "UP") !== 0) sub = "UP";
    else if (equal(k, "DOWN") !== 0) sub = "DOWN";
  } else if (t0.type[2] === TOK.KINT) {
    sub = "TRANSFER"; amountTok2 = true;
  }
  if (sub === "") {
    // re-prompt loop (source 100–138)
    while (sub === "") {
      session.io.write(SHLD01);
      const line = await readArgLine(session);
      if (line === null) return;
      const toks = tokenize(line, 0).tokens;
      if (toks.type[1] === TOK.KEOL || toks.ntok === 0) return;
      const k = toks.text[1] ?? "";
      if (equal(k, "UP") !== 0) sub = "UP";
      else if (equal(k, "DOWN") !== 0) sub = "DOWN";
      else if (equal(k, "TRANSFER") !== 0) sub = "TRANSFER";
    }
  }

  // ── DOWN (1000) ───────────────────────────────────────────────────────────────────────────
  if (sub === "DOWN") {
    ship.shieldCond = SHIELD.DOWN;
    session.io.write(SHLD08 + CRLF);
    return;
  }

  // ── UP (800) ──────────────────────────────────────────────────────────────────────────────
  if (sub === "UP") {
    if ((dev[DEV.KDSHLD] ?? 0) > KCRIT) {
      session.io.write(SHLD09 + CRLF);
      return;
    }
    ship.shieldCond = SHIELD.UP;
    ship.energy = Math.max(ship.energy - 1000, 0); // 100 raw → 1000 ×10
    session.io.write(SHLD06 + CRLF);
    trcoff(state, session.who); // source: if trstat ≠ 0 → trcoff(who)
    if (ship.energy <= 0) session.io.write(SHLD07 + CRLF);
    return;
  }

  // ── TRANSFER (200/300/400/500) ────────────────────────────────────────────────────────────
  let senrgy: number;
  if (amountTok2) {
    senrgy = (t0.val[2] ?? 0) * 10;
  } else if (amountTok3) {
    senrgy = (t0.val[3] ?? 0) * 10;
  } else {
    session.io.write(SHLD02);
    const line = await readArgLine(session);
    if (line === null) return;
    const toks: TokenBuffers = tokenize(line, 0).tokens;
    if (toks.type[1] !== TOK.KINT) return; // bail on non-numeric (source 3743)
    senrgy = (toks.val[1] ?? 0) * 10;
  }

  // 600: clamp positive transfer to "amount needed to fill shields" (source 3751)
  senrgy = Math.min(senrgy, (SHIELD_CAP - ship.shieldPct) * 25);

  // If positive and would not zero ship energy (senrgy < energy), proceed.
  // Else prompt shld03 "Confirm?" — only YES proceeds.
  if (senrgy >= ship.energy) {
    session.io.write(SHLD03);
    const line = await readArgLine(session);
    if (line === null) return;
    const toks = tokenize(line, 0).tokens;
    if (equal(toks.text[1] ?? "", "YES") === 0) {
      session.io.write(SHLD04 + CRLF);
      return;
    }
  }

  // 700: cap negative transfer at "drain all shields" (source 3759) and at "fill ship energy" (3761)
  if (-senrgy > ship.shieldPct * 25) senrgy = -25 * ship.shieldPct;
  if (ship.energy - senrgy > ENERGY_CAP) senrgy = -(ENERGY_CAP - ship.energy);

  ship.shieldPct = ship.shieldPct + Math.trunc(senrgy / 25);
  ship.energy = ship.energy - senrgy;
  session.io.write(SHLD05 + CRLF);

  if (ship.shieldPct <= 0) ship.shieldCond = SHIELD.DOWN;
  ship.condition = ship.energy < 10000 ? COND.YELLOW : COND.GREEN;
}
