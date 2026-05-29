// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * PLACE — drop n objects onto random empty board cells.
 *
 * Source: `DECWAR.FOR:2753–2779`; analysis Deliverable #10 Part C. Classification: Preserve
 * exactly (RNG draw order is load-bearing).
 *
 * For each of n objects: draw `iran(KGALV)`,`iran(KGALH)` (1..75) until an empty cell is
 * found; for a SHIP (class ≤ DXESHP) additionally reject cells within Chebyshev-4 of an enemy
 * base (and, per the original, within Chebyshev-2 of an enemy-CAPTURED planet — a check that
 * is inert as written because it compares a team code 1/2 to a planet class 6/7/8; reproduced
 * faithfully). Then `setdsp` the object. Returns the coordinates of the last object placed
 * (used by callers placing a single base/planet/ship).
 */
import { KGALV, KGALH, KNBASE, DX } from "../core/constants.ts";
import { ldis } from "../core/geometry.ts";
import { baskil } from "../runtime/scheduler.ts";
import { endgam } from "./endgam.ts";
import type { GameState } from "../core/state.ts";

export interface Coord {
  v: number;
  h: number;
}

export function place(state: GameState, object: number, n: number): Coord {
  const { rng, board } = state;
  let v = 0;
  let h = 0;
  const cls = Math.trunc(object / 100);
  for (let k = 0; k < n; k++) {
    for (;;) {
      v = rng.iran(KGALV);
      h = rng.iran(KGALH);
      if (board.disp(v, h) !== 0) continue; // cell occupied → retry
      if (cls > DX.ESHP) break; // not a ship → place directly
      if (!shipInEnemyTerritory(state, v, h, 3 - cls)) break; // ship: keep clear of the enemy
    }
    board.setdsp(v, h, object);
  }
  return { v, h };
}

/** True iff (v,h) is too close to an enemy base (≤4) or enemy-captured planet (≤2). */
function shipInEnemyTerritory(
  state: GameState,
  v: number,
  h: number,
  pteam: number,
): boolean {
  if ((state.nbase[pteam] ?? 0) > 0) {
    const bases = state.bases[pteam];
    if (bases) {
      for (let i = 1; i <= KNBASE; i++) {
        const b = bases[i];
        if (b && ldis(v, h, b.vPos, b.hPos, 4)) return true;
      }
    }
  }
  // Enemy-captured-planet check (inert as written; preserved for fidelity).
  if (state.nplnet > 0 && (state.numcap[pteam] ?? 0) > 0) {
    for (let i = 1; i <= state.nplnet; i++) {
      const p = state.planets[i];
      if (!p) continue;
      if (pteam !== state.board.dispc(p.vPos, p.hPos)) continue; // never equal → skip
      if (ldis(v, h, p.vPos, p.hPos, 2)) return true;
    }
  }
  return false;
}

/**
 * PLNRMV — remove a planet at slot `i` and compact the planet array.
 *
 * Source: `DECWAR.FOR:2851–2877`. Called from BUILD (stage 5 planet→base conversion) and
 * (later) from torpedo planet-destroy. If `pteam>0` the planet was a captured friendly of
 * that side: decrement `numcap[pteam]` and call `baskil(pteam)` (any ship docked there with
 * no other adjacent friendly port goes RED). Then shift planets[i+1..nplnet] down by one,
 * decrement `nplnet`, and decrement each shifted planet's board DISP code by 1 (the slot
 * index moved down — source line 2874: `disp = old_disp - 1`).
 *
 * Source DECWAR.FOR:1222 also fires `call endgam` after every planet destruction; we
 * route that through `endgam()` (Phase G-7) at the tail of this routine so every
 * plnrmv call-site (torpedoes, nova/snova, romtor) checks the game-end condition.
 */
export function plnrmv(state: GameState, i: number, pteam: number): void {
  if (pteam < 0 || i > state.nplnet || i <= 0) return;
  if (pteam > 0 && pteam <= 2) {
    state.numcap[pteam] = Math.max((state.numcap[pteam] ?? 0) - 1, 0);
    baskil(state, pteam as 1 | 2);
  }
  // Shift planets[i+1..nplnet] down one slot.
  for (let j = i; j < state.nplnet; j++) state.planets[j] = state.planets[j + 1]!;
  state.nplnet--;
  // The compacted entries' DISP codes (which contain the slot index) all decrement by 1.
  for (let j = i; j <= state.nplnet; j++) {
    const p = state.planets[j]!;
    state.board.setdsp(p.vPos, p.hPos, state.board.disp(p.vPos, p.hPos) - 1);
  }
  endgam(state); // game-end check (source DECWAR.FOR:1222 after every planet kill)
}
