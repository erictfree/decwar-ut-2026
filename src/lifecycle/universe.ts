// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Universe build — "the first player builds the universe."
 *
 * Source: `SETUP.FOR:213–304`; analysis Deliverable #10 §2.3/Part C. Classification: Preserve
 * exactly (object counts + RNG draw order) / Preserve semantically (storage).
 *
 * RNG draw order (load-bearing): `nstar = int(51*ran())*5 + 100`, then
 * `nhole = int(41*ran() + 10)`, then placements (each PLACE draws iran×2 per attempt) in the
 * order: 10 Federation bases, 10 Empire bases, 60 neutral planets, nstar stars, and — only if
 * black holes are enabled — nhole black holes.
 *
 * Defaults used here (the SETUP prompt answers): Regular game (RNG seeded at GameState
 * creation, not reseeded per-activation), Romulan involved = state.romopt (default yes),
 * black holes = state.blhopt (default no). The interactive Regular/Tournament/Romulan/
 * black-hole prompts are deferred.
 */
import { KNBASE, KNPLNT, KNPLAY, KGALV, KGALH, DX, SHIELD_CAP } from "../core/constants.ts";
import { place } from "./place.ts";
import type { GameState } from "../core/state.ts";

/**
 * Decide whether `activate`/`runSetup` should rebuild the universe before letting the
 * next first-player in. Mirrors SETUP.FOR:213–215: the first player rebuilds when (a)
 * the universe has never been built, OR (b) `numply == 0` and the 5-minute hitime grace
 * has expired (the last player left more than 5 min ago, so the galaxy is reset).
 * `state.endflg === -2` (total destruction) also forces a rebuild — the previous game
 * has concluded with no survivors.
 */
export function shouldRebuildUniverse(state: GameState): boolean {
  if (!state.built) return true;
  if (state.endflg === -2) return true; // game ended in total destruction → fresh galaxy
  if (state.numply === 0 && state.hitime !== 0 && state.clock.now() >= state.hitime) {
    return true; // hitime grace expired
  }
  return false;
}

/**
 * Reset the high-segment (game) state that's tied to a single game's lifetime, so the
 * next universe build starts from a clean slate. Mirrors the source's `blkset(hfz, 0, ...)`
 * at SETUP.FOR:216 — Romulan presence, kill queue, end flag, hitime, team-turn counters
 * all zero out. `bits[]` (identity table) is preserved per the port's "all 18" correction.
 */
export function resetHighSegment(state: GameState): void {
  state.endflg = 0;
  state.hitime = 0;
  state.tmturn[1] = 0;
  state.tmturn[2] = 0;
  state.tmturn[3] = 0;
  state.romulan.exists = false;
  state.romulan.numSpawned = 0;
  state.romulan.moveCounter = 0;
  state.romulan.torpPause = 0;
  state.romulan.phaserPause = 0;
  state.romulan.scanMask = 0;
  for (let i = 1; i <= 8; i++) state.romulan.score[i] = 0;
  state.nkill = 0;
  state.kilndx = 0;
  for (let i = 1; i <= state.kilque.length - 1; i++) {
    const r = state.kilque[i];
    if (r) { r.identity = ""; r.deathMs = 0; r.who = 0; r.team = 1; }
  }
  // Re-zero the board — buildUniverse will repopulate, but stale cells from the previous
  // game must not bleed through.
  for (let v = 1; v <= KGALV; v++) for (let h = 1; h <= KGALH; h++) state.board.setdsp(v, h, 0);
}

export function buildUniverse(state: GameState): void {
  const { rng } = state;

  // Bases: 10 per side, full strength; mark all ship slots available (alive = 1).
  for (let side = 1 as 1 | 2; side <= 2; side = (side + 1) as 1 | 2) {
    state.nbase[side] = KNBASE;
    const bases = state.bases[side];
    for (let i = 1; i <= KNBASE; i++) {
      const b = bases?.[i];
      if (b) {
        b.strength = SHIELD_CAP; // base(i,3,j) = 1000
        b.scanMask = side; // base(i,4,j) = j
      }
    }
  }
  state.numsid[1] = 0;
  state.numsid[2] = 0;
  for (let i = 1; i <= KNPLAY; i++) state.alive[i] = 1; // blkset(alive,1,KNPLAY): all available

  // Object counts (RNG: nstar then nhole), then the fixed 60 planets.
  const nstar = Math.trunc(51 * rng.ran()) * 5 + 100; // 100..355
  const nhole = Math.trunc(41 * rng.ran() + 10); // 10..50
  state.nplnet = KNPLNT; // 60 (forced)

  // Placements, in source order.
  for (let i = 1; i <= KNBASE; i++) {
    const c = place(state, DX.FBAS * 100 + i, 1);
    const b = state.bases[1]?.[i];
    if (b) {
      b.vPos = c.v;
      b.hPos = c.h;
    }
  }
  for (let i = 1; i <= KNBASE; i++) {
    const c = place(state, DX.EBAS * 100 + i, 1);
    const b = state.bases[2]?.[i];
    if (b) {
      b.vPos = c.v;
      b.hPos = c.h;
    }
  }
  for (let i = 1; i <= state.nplnet; i++) {
    const c = place(state, DX.NPLN * 100 + i, 1);
    const p = state.planets[i];
    if (p) {
      p.vPos = c.v;
      p.hPos = c.h;
      p.buildCount = 0;
      p.scanMask = 0;
    }
  }
  place(state, DX.STAR * 100, nstar);
  if (state.blhopt) place(state, DX.BHOL * 100, nhole);
}
