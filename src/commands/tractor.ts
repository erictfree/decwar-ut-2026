// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * TRACTOR — engage / release a tractor beam on a friendly ship.
 *
 * Source: `DECWAR.FOR:4442–4519` (subroutine TRACTR + entry TRCOFF); strings `MSG.MAC:349–357`.
 * Classification: Preserve exactly. Zero RNG draws.
 *
 * Dispatch:
 *   • bare `TRACTOR` AND `trstat[who] != 0` → TRCOFF (release the existing beam)
 *   • `TRACTOR OFF` → TRCOFF; or `tract2` if no beam is active
 *   • `TRACTOR <ship>` while own beam already active → `tract3`
 *   • `TRACTOR` with no name and no beam → prompt `tract1` for the ship
 *
 * Validation (in source order):
 *   • Unknown ship name      → `unkshp`
 *   • Self                   → `tract4`
 *   • Enemy                  → `tract5`
 *   • Not playing (`alive`)  → `noship`
 *   • Not adjacent (ldis≤1)  → `energ3`  (yes — TRACTOR shares ENERGY's "not adjacent" string)
 *   • Target already towing  → `tract6`  (with the target's odisp prefix)
 *   • Source shields up      → `tract7`
 *   • Target shields up      → `tract8`  (with the target's odisp prefix)
 *
 * On success: `trstat[who] = i; trstat[i] = who` (mutual coupling). `makhit` with `iwhat=13`
 * to BOTH (engager and target): `dbits = bits[who] | bits[i]`. The outhit renderer (case 13)
 * emits `OUTH23` ("Tractor beam activated, Captain.").
 *
 * TRCOFF: `dbits = bits[ip] | bits[trstat[ip]]`; `iwhat = 14`; clear both `trstat` slots;
 * makhit. Outhit case 14 emits `OUTH25`.
 */
import { tokenize } from "../parser/tokenizer.ts";
import { equal } from "../parser/match.ts";
import { CRLF } from "../render/output.ts";
import {
  TRACT1, TRACT2, TRACT3, TRACT4, TRACT5, TRACT6, TRACT7, TRACT8,
  ENERG3, NOSHIP, UNKSHP, SHIP_NAMES,
} from "../render/strings.ts";
import { ldis } from "../core/geometry.ts";
import { TOK, KNPLAY, KCMDTM, SHIELD } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session, TokenBuffers } from "../core/session.ts";

async function readArgLine(session: Session): Promise<string | null> {
  let line: string | null = null;
  while (line === null && !session.hungup) line = await session.io.readCommandLine(KCMDTM);
  return session.hungup ? null : line;
}

function matchShip(token: string): number {
  for (let i = 1; i <= KNPLAY; i++) if (equal(token, SHIP_NAMES[i] ?? "")) return i;
  return 0;
}

/**
 * TRCOFF: release a tractor beam. Notifies both ends via makhit iwhat=14. Source 4514–4519.
 * Exported so SHIELDS can call it when raising shields cuts an active beam.
 */
export function trcoff(state: GameState, ip: number): void {
  const partner = state.trstat[ip] ?? 0;
  if (partner === 0) return;
  const bits = (state.bits[ip] ?? 0) | (state.bits[partner] ?? 0);
  state.trstat[partner] = 0;
  state.trstat[ip] = 0;
  state.bus.makeHit({
    iwhat: 14,
    dispfr: 0, dispto: 0,
    ihita: 0, critdv: 0, critdm: 0,
    vfrom: 0, hfrom: 0, vto: 0, hto: 0,
    klflg: 0,
    shcnfr: 0, shstfr: 0, shcnto: 0, shstto: 0,
    shjump: 0,
  }, bits);
}

export async function tractor(state: GameState, session: Session): Promise<void> {
  const who = session.who;
  const ship = state.ships[who];
  if (!ship) return;
  session.io.write(CRLF);

  let toks: TokenBuffers = session.tokens;
  // Bare TRACTOR with an active beam → release immediately (source 4449–4450).
  if (toks.ntok <= 1 && (state.trstat[who] ?? 0) !== 0) {
    trcoff(state, who);
    return;
  }

  // ── Get a sub-keyword or ship name in token index `idx` ──────────────────────────────────
  let idx = 2;
  let key = toks.text[idx] ?? "";
  while (toks.type[idx] !== TOK.KALF) {
    session.io.write(TRACT1);
    const line = await readArgLine(session);
    if (line === null) return;
    toks = tokenize(line, 0).tokens;
    if (toks.type[1] === TOK.KEOL || toks.ntok === 0) return;
    idx = 1;
    key = toks.text[idx] ?? "";
  }

  // ── TRACTOR OFF ──────────────────────────────────────────────────────────────────────────
  if (equal(key, "OFF") !== 0) {
    if ((state.trstat[who] ?? 0) === 0) {
      session.io.write(TRACT2 + CRLF);
      return;
    }
    trcoff(state, who);
    return;
  }

  // ── Engage path: refuse if we already tow someone ────────────────────────────────────────
  if ((state.trstat[who] ?? 0) !== 0) {
    session.io.write(TRACT3 + CRLF);
    return;
  }

  // ── Resolve target ───────────────────────────────────────────────────────────────────────
  const i = matchShip(key);
  if (i === 0) {
    session.io.write(UNKSHP + CRLF);
    return;
  }
  if (i === who) {
    session.io.write(TRACT4 + CRLF);
    return;
  }
  const dteam = i > KNPLAY / 2 ? 2 : 1;
  if (session.team !== dteam) {
    session.io.write(TRACT5 + CRLF);
    return;
  }
  if ((state.alive[i] ?? 0) >= 0) {
    session.io.write(NOSHIP + CRLF);
    return;
  }
  const target = state.ships[i]!;
  if (!ldis(ship.vPos, ship.hPos, target.vPos, target.hPos, 1)) {
    session.io.write(ENERG3 + CRLF);
    return;
  }
  if ((state.trstat[i] ?? 0) !== 0) {
    session.io.write(`${SHIP_NAMES[i]} ${TRACT6}${CRLF}`);
    return;
  }
  // Source 4499: `if shieldCond < 0 → goto 1200` (else tract7). So shields-up (≥ 0) refuses.
  if (ship.shieldCond >= 0) {
    session.io.write(TRACT7 + CRLF);
    return;
  }
  if (target.shieldCond >= 0) {
    session.io.write(`${SHIP_NAMES[i]} ${TRACT8}${CRLF}`);
    return;
  }

  // ── Engage (source 4508–4512) ────────────────────────────────────────────────────────────
  state.trstat[who] = i;
  state.trstat[i] = who;
  const bits = (state.bits[who] ?? 0) | (state.bits[i] ?? 0);
  state.bus.makeHit({
    iwhat: 13,
    dispfr: who + session.team * 100,
    dispto: i + dteam * 100,
    ihita: 0, critdv: 0, critdm: 0,
    vfrom: ship.vPos, hfrom: ship.hPos,
    vto: target.vPos, hto: target.hPos,
    klflg: 0,
    shcnfr: SHIELD.DOWN, shstfr: 0,
    shcnto: SHIELD.DOWN, shstto: 0,
    shjump: 0,
  }, bits);
}
