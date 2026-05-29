// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * PHADAM / TORDAM — phaser and torpedo damage to a ship or base, sharing the damage tail.
 *
 * Source: `DECWAR.FOR:4099–4234` (TORDAM head 4099–4131; shared tail 4133–4176; PHADAM entry
 * 4177; torp shield-deflection 4206–4218). Classification: Preserve-as-real (OQ-1): JS double
 * (the default CombatMath policy) with truncate-toward-zero on every store into the ×10 integer
 * fields. A bit-exact single-precision emulation could replace this module wholesale.
 *
 * Phaser RNG draws: rana, pwr-ran, [iran(5) if ≥1700], [device-ran, jitter-ran if ship crit].
 * Torpedo RNG draws: rand, rana, hit-size ran, then the SAME critical draws.
 *
 * Firer context gates scoring/firer-mod: a player weapon sets ship=true, player=true; NPC
 * base/planet defense sets ship=false. JUMP displacement (torp) and planet/Romulan targets are
 * handled by the callers / deferred.
 */
import { pwr } from "./pwr.ts";
import { endgam } from "../lifecycle/endgam.ts";
import { DX, DEV, KNDEV, KENDAM, PT, COND } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";

export interface Firer {
  ship: boolean;
  player: boolean;
  who: number;
  team: 1 | 2;
  tpoint: number[];
}

export interface DamageResult {
  iwhat: number; // 1 phaser hit, 2 torpedo hit, 3 torpedo deflected
  ihita: number;
  critdv: number;
  critdm: number;
  klflg: number;
  shstto: number;
  shcnto: number;
}

interface Core {
  ihita: number;
  critdv: number;
  critdm: number;
  klflg: number;
  shstto: number;
  shcnto: number;
}

const trunc = Math.trunc;

// ── PHASER entry (PHADAM) ───────────────────────────────────────────────────────────────────
export function phadam(
  state: GameState,
  firer: Firer,
  nplc: number,
  j: number,
  id: number,
  phit: number,
): DamageResult {
  const rng = state.rng;
  const ps = firer.player && firer.ship;
  const targetIsBase = nplc >= DX.FBAS;

  let powfac = 80;
  const rana = rng.ran(); // DRAW 1
  if (!targetIsBase && (state.ships[j]?.shieldCond ?? 0) > 0) powfac /= 2;
  if (targetIsBase) powfac /= 2;
  let hit = pwr(0.9 + 0.02 * rng.ran(), id); // DRAW 2
  const fdev = state.devices[firer.who];
  if (ps && fdev && ((fdev[DEV.KDPHAS] ?? 0) > 0 || (fdev[DEV.KDCOMP] ?? 0) > 0)) hit *= 0.8;

  if (targetIsBase) {
    const b = state.bases[nplc - 2]![j]!;
    let hita = hit;
    hit = (1000 - b.strength) * hita * 0.001;
    b.strength = trunc(
      b.strength - (hita * powfac * phit * Math.max(b.strength * 0.001, 0.1) + 10) * 0.03,
    );
    hita = hit * powfac * phit;
    return { iwhat: 1, ...baseTail(state, firer, ps, nplc, j, hita, rana) };
  }

  const v = state.ships[j]!;
  let hita: number;
  if (v.shieldCond < 0) {
    hita = hit * powfac * phit; // shields down (label 800)
  } else {
    hita = hit;
    hit = (1000 - v.shieldPct) * hita * 0.001;
    v.shieldPct = trunc(
      v.shieldPct - (hita * powfac * phit * Math.max(v.shieldPct * 0.001, 0.1) + 10) * 0.03,
    );
    if (v.shieldPct < 0) v.shieldPct = 0;
    hita = hit * powfac * phit;
  }
  return { iwhat: 1, ...shipTail(state, firer, ps, nplc, j, hita, rana) };
}

// ── TORPEDO entry (TORDAM) ──────────────────────────────────────────────────────────────────
export function tordam(state: GameState, firer: Firer, nplc: number, j: number): DamageResult {
  const rng = state.rng;
  const ps = firer.player && firer.ship;
  const targetIsBase = nplc >= DX.FBAS;

  const rand = rng.ran(); // DRAW 1
  const rana = rng.ran(); // DRAW 2
  const hit = 4000.0 + 4000.0 * rng.ran(); // DRAW 3 (raw torpedo hit 4000..8000)

  // Shield deflection: strong shields can turn the torpedo away (no damage).
  if (targetIsBase) {
    const b = state.bases[nplc - 2]![j]!;
    if (rana - b.strength * 0.001 * rand + 0.1 <= 0) {
      b.strength = Math.max(trunc(b.strength - 50.0 * rana), 0);
      return { iwhat: 3, ihita: 0, critdv: 0, critdm: 0, klflg: 0, shstto: b.strength, shcnto: 1 };
    }
    let hita = hit * (1000 - b.strength) * 0.001;
    b.strength = trunc(b.strength - (hit * Math.max(b.strength * 0.001, 0.1) + 10) * 0.03);
    return { iwhat: 2, ...baseTail(state, firer, ps, nplc, j, hita, rana) };
  }

  const v = state.ships[j]!;
  if (v.shieldCond > 0 && rana - v.shieldPct * 0.001 * rand + 0.1 <= 0) {
    v.shieldPct = Math.max(trunc(v.shieldPct - 50.0 * rana), 0);
    v.condition = COND.RED;
    return { iwhat: 3, ihita: 0, critdv: 0, critdm: 0, klflg: 0, shstto: v.shieldPct, shcnto: v.shieldCond };
  }
  let hita: number;
  if (v.shieldCond < 0) {
    hita = hit; // shields down → full hit (label 300)
  } else {
    hita = hit * (1000 - v.shieldPct) * 0.001;
    v.shieldPct = trunc(v.shieldPct - (hit * Math.max(v.shieldPct * 0.001, 0.1) + 10) * 0.03);
    if (v.shieldPct < 0) v.shieldPct = 0;
  }
  return { iwhat: 2, ...shipTail(state, firer, ps, nplc, j, hita, rana) };
}

// ── shared tail (label 400) ─────────────────────────────────────────────────────────────────
function shipTail(
  state: GameState,
  firer: Firer,
  ps: boolean,
  nplc: number,
  j: number,
  hita0: number,
  rana: number,
): Core {
  const rng = state.rng;
  const v = state.ships[j]!;
  const vdev = state.devices[j]!;
  let hita = hita0;
  let ihita = trunc(hita);
  let critdv = 0;
  let critdm = 0;
  let klflg = 0;

  if (!(hita * (rana + 0.1) < 1700.0)) {
    rng.iran(5); // DRAW (consumed even for a ship target)
    hita = hita / 2.0;
    critdv = trunc(KNDEV * rng.ran() + 1.0); // DRAW
    vdev[critdv] = trunc((vdev[critdv] ?? 0) + hita);
    if (critdv === DEV.KDSHLD) v.shieldCond = -1;
    critdm = trunc(hita);
    hita = hita + (rng.ran() - 0.5) * 1000.0; // DRAW (jitter)
    ihita = trunc(hita);
  }

  v.damage = trunc(v.damage + hita);
  v.energy = trunc(v.energy - hita);
  if (v.shieldPct <= 0) v.shieldCond = -1;

  const rs = firer.ship && !firer.player; // Romulan-fire scoring (into rsr)
  if (ps && 3 - firer.team === nplc) firer.tpoint[PT.KPEDAM] = trunc((firer.tpoint[PT.KPEDAM] ?? 0) + hita);
  if (ps && 5 - firer.team === nplc) firer.tpoint[PT.KPBDAM] = trunc((firer.tpoint[PT.KPBDAM] ?? 0) + hita);
  if (rs) firer.tpoint[PT.KPEDAM] = trunc((firer.tpoint[PT.KPEDAM] ?? 0) + hita); // Romulan → any ship

  v.condition = COND.RED;
  const shstto = v.shieldPct;
  const shcnto = v.shieldCond;
  if (v.damage >= KENDAM || v.energy <= 0) klflg = 2;
  if (klflg !== 0) {
    state.board.setdsp(v.vPos, v.hPos, 0);
    state.alive[j] = 0;
    if (firer.ship) firer.tpoint[PT.KPEKIL] = (firer.tpoint[PT.KPEKIL] ?? 0) + 5000;
  }
  // NOTE: torpedo JUMP displacement of a surviving victim is deferred.
  return { ihita, critdv, critdm, klflg, shstto, shcnto };
}

function baseTail(
  state: GameState,
  firer: Firer,
  ps: boolean,
  nplc: number,
  j: number,
  hita: number,
  rana: number,
): Core {
  const rng = state.rng;
  const side = nplc - 2;
  const b = state.bases[side]![j]!;
  const ihita = trunc(hita);
  let critdm = 0;
  let klflg = 0;
  let shstto = 0;

  let go1400 = false;
  if (!(hita * (rana + 0.1) < 1700.0)) {
    if (rng.iran(5) === 5) go1400 = true; // DRAW → critical base hit
  }

  const rs = firer.ship && !firer.player; // Romulan-fire scoring (into rsr)
  if (!go1400) {
    b.strength = Math.max(trunc(b.strength - hita * 0.01), 0);
    if (ps && 5 - firer.team === nplc) firer.tpoint[PT.KPBDAM] = trunc((firer.tpoint[PT.KPBDAM] ?? 0) + hita);
    if (rs) firer.tpoint[PT.KPBDAM] = trunc((firer.tpoint[PT.KPBDAM] ?? 0) + hita); // Romulan → any base
    shstto = b.strength;
    if (b.strength > 0) return { ihita, critdv: 0, critdm: 0, klflg: 0, shstto, shcnto: 1 };
  }

  b.strength = b.strength - 50 - trunc(100.0 * rng.ran()); // DRAW
  critdm = 1;
  if (rng.iran(10) === 10 || b.strength <= 0) klflg = 2; // DRAW
  shstto = b.strength;
  if (klflg === 0) return { ihita, critdv: 0, critdm, klflg, shstto, shcnto: 1 };

  state.board.setdsp(b.vPos, b.hPos, 0);
  state.nbase[side] = (state.nbase[side] ?? 0) - 1;
  if (firer.ship) firer.tpoint[PT.KPBDAM] = trunc((firer.tpoint[PT.KPBDAM] ?? 0) + 10000);
  b.strength = 0;
  // ENDGAM check — source DECWAR.FOR:1222 / 3709 fires `call endgam` after every base
  // kill. Wired here (the only place nbase[] is decremented for combat) so phasers,
  // torpedoes, and nova-base-kills all flow through it.
  endgam(state);
  return { ihita, critdv: 0, critdm, klflg, shstto: 0, shcnto: 1 };
}
