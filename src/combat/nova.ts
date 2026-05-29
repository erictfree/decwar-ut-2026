// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * NOVA / SNOVA / JUMP — star-explosion damage cascade and object displacement.
 *
 * Source:
 *   • NOVA   `DECWAR.FOR:2248–2381` — applies a single-star blast to one victim.
 *   • SNOVA  `DECWAR.FOR:3790–3833` — chain explosion: walks the 3×3 around a dead star,
 *            collects victims (and other stars with `iran(5)==5`), invokes NOVA per victim,
 *            then loops on each chained star.
 *   • JUMP   `DECWAR.FOR:1276–1323` — displaces one object by `(disV, disH)` (single step).
 *            Off-galaxy or occupied → no-op. Black hole at the destination → object dies
 *            (`klflg=1`, alive=0; bases set strength=0). Ships go RED + undock on jump.
 *
 * Classification: Preserve exactly. RNG draw order is load-bearing.
 *
 * The "nova never kills the Romulan" branch (source line 2347–2348 — the `c--` comment
 * shows the original randomized-kill version was disabled; the active code falls into the
 * "displace + halve `erom`" path) is preserved as written.
 */
import { KGALV, KGALH, KNDEV, KENDAM, KCRIT, DX, DEV, PT, COND } from "../core/constants.ts";
import { pridis } from "../comms/messageBus.ts";
import { trcoff } from "../commands/tractor.ts";
import { baskil } from "../runtime/scheduler.ts";
import { plnrmv } from "../lifecycle/place.ts";
import { endgam } from "../lifecycle/endgam.ts";
import { KRANGE } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";

/**
 * Carrier for a NOVA invocation's scoring context. The source's `PLAYER` flag (true iff the
 * triggering action was a player's, not a Romulan's) routes blast scoring to either the
 * player's `tpoint` / `tmscor` or the Romulan's `rsr`. Other firer fields are kept compatible
 * with PHADAM's `Firer` for callsite ergonomics.
 */
export interface NovaFirer {
  player: boolean;
  team: 1 | 2;
  tpoint: number[];
}

const inGal = (v: number, h: number): boolean =>
  v >= 1 && v <= KGALV && h >= 1 && h <= KGALH;

/**
 * JUMP — displace one object (ship/base/Romulan) by (disV, disH). Returns true if the object
 * was destroyed by being blown into a black hole (`klflg=1` in source).
 */
export function jump(
  state: GameState,
  nplc: number,
  j: number,
  disV: number,
  disH: number,
): boolean {
  // Resolve current location based on object class.
  let iloc1: number, jloc1: number;
  if (nplc <= DX.ESHP) {
    iloc1 = state.ships[j]!.vPos;
    jloc1 = state.ships[j]!.hPos;
  } else if (nplc === DX.ROM) {
    iloc1 = state.romulan.vPos;
    jloc1 = state.romulan.hPos;
  } else {
    // base
    iloc1 = state.bases[nplc - 2]![j]!.vPos;
    jloc1 = state.bases[nplc - 2]![j]!.hPos;
  }

  const iVV = iloc1 + Math.trunc(disV);
  const iHH = jloc1 + Math.trunc(disH);
  if (!inGal(iVV, iHH)) return false;
  // sanity: the source rejects displacements that aren't exactly one-cell away
  if (Math.max(Math.abs(iVV - iloc1), Math.abs(iHH - jloc1)) !== 1) return false;

  const lCls = state.board.dispc(iVV, iHH);
  if (lCls === DX.BHOL) {
    // ── Blown into a black hole ──────────────────────────────────────────────────────────
    state.board.setdsp(iloc1, jloc1, 0);
    if (nplc === DX.ROM) {
      state.romulan.exists = false;
      return true;
    }
    if (nplc <= DX.ESHP) {
      state.ships[j]!.damage = KENDAM;
      state.alive[j] = 0;
    } else {
      state.bases[nplc - 2]![j]!.strength = 0;
    }
    return true;
  }
  if (lCls !== DX.MPTY) return false; // occupied — no displacement

  // ── Displace ──────────────────────────────────────────────────────────────────────────
  state.board.setdsp(iloc1, jloc1, 0);
  state.board.setdsp(iVV, iHH, nplc * 100 + j);
  if (nplc === DX.ROM) {
    state.romulan.vPos = iVV;
    state.romulan.hPos = iHH;
  } else if (nplc <= DX.ESHP) {
    state.ships[j]!.vPos = iVV;
    state.ships[j]!.hPos = iHH;
    state.ships[j]!.condition = COND.RED;
    state.docked[j] = 0; // undocked
  } else {
    state.bases[nplc - 2]![j]!.vPos = iVV;
    state.bases[nplc - 2]![j]!.hPos = iHH;
  }
  return false;
}

/**
 * NOVA — apply one star's blast to a single object (ship / base / planet / Romulan).
 *
 * `vc, hc` is the exploding star's location (the blast origin). `(disV, disH)` is the
 * 1-cell step direction from star → victim, used by `jump` to displace the victim away
 * from the blast. `firer` carries the scoring routing context (player vs. Romulan-triggered).
 *
 * RNG draws (in source order, lines 2268–2290):
 *   1. For ships: `ran()` × KNDEV (one per device).
 *   2. `iran(1000)` for the `ihita` bonus (always).
 *   3. For ships: `ran()` for the energy-loss multiplier.
 *   4. For ships with shields up: `iran(100)` for the shield-reduction floor.
 *   5. For bases: `iran(100)` for the strength-reduction floor.
 * (Planet branch has no RNG; Romulan branch has none either — the "kill" `iran(2)` is
 *  commented out in source.)
 */
export function nova(
  state: GameState,
  firer: NovaFirer,
  nplc: number,
  j: number,
  vc: number,
  hc: number,
  disV: number,
  disH: number,
): void {
  // ── Romulan victim (source 2347–2361, "don't kill the Romulan" branch) ─────────────────
  if (nplc === DX.ROM) {
    if (state.romulan.exists) {
      jump(state, DX.ROM, 1, disV, disH);
      state.romulan.energy = Math.trunc(state.romulan.energy / 2);
    }
    const erom = state.romulan.energy;
    if (!firer.player) state.romulan.score[PT.KPRKIL] = (state.romulan.score[PT.KPRKIL] ?? 0) - erom;
    else firer.tpoint[PT.KPRKIL] = (firer.tpoint[PT.KPRKIL] ?? 0) + erom;
    state.bus.makeHit(
      {
        iwhat: 8,
        dispfr: DX.STAR * 100,
        dispto: DX.ROM * 100,
        ihita: 0, critdv: 0, critdm: 0,
        vfrom: vc, hfrom: hc,
        vto: state.romulan.vPos, hto: state.romulan.hPos,
        klflg: 0,
        shcnfr: 0, shstfr: 0, shcnto: 1, shstto: erom,
        shjump: state.romulan.exists ? 1 : 0,
      },
      pridis(state, state.romulan.vPos, state.romulan.hPos, KRANGE, 0),
    );
    if (!state.romulan.exists) {
      // Romulan died (separately from the "don't kill" branch — only via the BH path of jump)
      const bonus = 5000;
      if (!firer.player) state.romulan.score[PT.KPRKIL] = (state.romulan.score[PT.KPRKIL] ?? 0) - bonus;
      else firer.tpoint[PT.KPRKIL] = (firer.tpoint[PT.KPRKIL] ?? 0) + bonus;
    }
    return;
  }

  // ── Planet victim (source 2363–2380) ───────────────────────────────────────────────────
  if (nplc >= DX.NPLN && nplc <= DX.EPLN) {
    const planet = state.planets[j];
    if (!planet) return;
    planet.buildCount -= 3;
    const shstto = Math.max(planet.buildCount, 0);
    const killed = planet.buildCount < 0;
    state.bus.makeHit(
      {
        iwhat: 8,
        dispfr: DX.STAR * 100,
        dispto: nplc * 100 + j,
        ihita: 0, critdv: 0, critdm: 0,
        vfrom: vc, hfrom: hc,
        vto: planet.vPos, hto: planet.hPos,
        klflg: killed ? 2 : 0,
        shcnfr: 0, shstfr: 0, shcnto: 0, shstto,
        shjump: 0,
      },
      pridis(state, planet.vPos, planet.hPos, KRANGE, 0),
    );
    if (killed) {
      if (firer.player) firer.tpoint[PT.KNPDES] = (firer.tpoint[PT.KNPDES] ?? 0) - 1000;
      else state.romulan.score[PT.KNPDES] = (state.romulan.score[PT.KNPDES] ?? 0) - 1000;
      const pteam = state.board.dispc(planet.vPos, planet.hPos) - DX.NPLN;
      state.board.setdsp(planet.vPos, planet.hPos, 0);
      plnrmv(state, j, pteam);
    }
    return;
  }

  // ── Ship or base ───────────────────────────────────────────────────────────────────────
  const rng = state.rng;
  let d = 1000;
  if (nplc >= DX.FBAS) {
    d -= state.bases[nplc - 2]![j]!.strength;
  } else {
    const v = state.ships[j]!;
    if (v.shieldCond > 0) d -= v.shieldPct;
  }
  if (d < 200) d = 250;

  // Ship: damage every device (DRAW: KNDEV × ran(0)). Bases skip this block (source 2265).
  if (nplc < DX.FBAS) {
    const dev = state.devices[j]!;
    for (let i = 1; i <= KNDEV; i++) {
      dev[i] = (dev[i] ?? 0) + Math.trunc(rng.ran() * d * 4.0);
    }
    if ((dev[DEV.KDSHLD] ?? 0) >= KCRIT) state.ships[j]!.shieldCond = -1;
  }

  // ihita and scoring routing (source 2272–2284).
  const ihita = d * 8 + rng.iran(1000); // DRAW: iran(1000)
  routeBlastScoring(state, firer, nplc, ihita);

  // ── Branch on ship vs. base ───────────────────────────────────────────────────────────
  if (nplc < DX.FBAS) {
    const v = state.ships[j]!;
    v.damage += ihita;
    v.energy -= Math.trunc(ihita * rng.ran()); // DRAW
    if (v.shieldCond > 0) {
      const drop = 300 - rng.iran(100); // DRAW (only when shields are up)
      v.shieldPct = Math.max(v.shieldPct - drop, 0);
    }
    if (v.shieldPct <= 0) v.shieldCond = -1;

    let klflg: 0 | 2 = 0;
    if (v.damage >= KENDAM || v.energy <= 0) {
      state.board.setdsp(v.vPos, v.hPos, 0);
      state.alive[j] = 0;
      klflg = 2;
    } else {
      jump(state, nplc, j, disV, disH);
    }

    // Ship-kill scoring (source 2302–2307).
    if (klflg !== 0) {
      if (firer.player && firer.team === nplc) {
        // own-team friendly fire kill — negative
        state.tmscor[firer.team]![PT.KPEKIL] = (state.tmscor[firer.team]![PT.KPEKIL] ?? 0) - 5000;
      } else if (firer.player) {
        state.tmscor[firer.team]![PT.KPEKIL] = (state.tmscor[firer.team]![PT.KPEKIL] ?? 0) + 5000;
      } else {
        state.romulan.score[PT.KPEKIL] = (state.romulan.score[PT.KPEKIL] ?? 0) + 5000;
      }
    }

    state.bus.makeHit(
      {
        iwhat: 8,
        dispfr: DX.STAR * 100,
        dispto: nplc * 100 + j,
        ihita, critdv: 0, critdm: 0,
        vfrom: vc, hfrom: hc,
        vto: v.vPos, hto: v.hPos,
        klflg,
        shcnfr: 0, shstfr: 0, shcnto: v.shieldCond, shstto: v.shieldPct,
        shjump: klflg ? 0 : 1,
      },
      pridis(state, v.vPos, v.hPos, KRANGE, 0),
    );
    if ((state.trstat[j] ?? 0) !== 0) trcoff(state, j);
    return;
  }

  // ── Base victim ──────────────────────────────────────────────────────────────────────
  const jbase = (nplc - 2) as 1 | 2;
  const base = state.bases[jbase]![j]!;
  // "Base under attack" galaxy-wide alert when the base is at full strength (source 2314–2318).
  if (base.strength === 1000) {
    state.bus.makeHit(
      {
        iwhat: 9,
        dispfr: DX.STAR * 100,
        dispto: nplc * 100 + j,
        ihita: 0, critdv: 0, critdm: 0,
        vfrom: vc, hfrom: hc, vto: base.vPos, hto: base.hPos,
        klflg: 0, shcnfr: 0, shstfr: 0, shcnto: 0, shstto: 0, shjump: 0,
      },
      pridis(state, 30, 30, 100, jbase) & ~state.nomsg,
    );
  }
  base.strength = Math.max(base.strength - 300 + rng.iran(100), 0); // DRAW: iran(100)
  if (base.strength > 0) jump(state, nplc, j, disV, disH);

  let klflg: 0 | 2 = 0;
  if (base.strength <= 0) {
    klflg = 2;
    // Base-kill scoring (source 2326–2330).
    if (!firer.player) state.romulan.score[PT.KPBDAM] = (state.romulan.score[PT.KPBDAM] ?? 0) + 10000;
    else if (firer.team === jbase) state.tmscor[firer.team]![PT.KPBDAM] = (state.tmscor[firer.team]![PT.KPBDAM] ?? 0) - 10000;
    else state.tmscor[firer.team]![PT.KPBDAM] = (state.tmscor[firer.team]![PT.KPBDAM] ?? 0) + 10000;
    state.nbase[jbase] = Math.max((state.nbase[jbase] ?? 0) - 1, 0);
    baskil(state, jbase);
    endgam(state); // nova-base-kill → game-end check (source DECWAR.FOR ROMDEST:2876)
  }

  state.bus.makeHit(
    {
      iwhat: 8,
      dispfr: DX.STAR * 100,
      dispto: nplc * 100 + j,
      ihita: 0, critdv: 0, critdm: 0,
      vfrom: vc, hfrom: hc, vto: base.vPos, hto: base.hPos,
      klflg,
      shcnfr: 0, shstfr: 0, shcnto: 1, shstto: base.strength,
      shjump: klflg ? 0 : 1,
    },
    pridis(state, base.vPos, base.hPos, KRANGE, 0),
  );

  // Base-destroyed galaxy-wide notice.
  if (base.strength <= 0) {
    state.board.setdsp(base.vPos, base.hPos, 0);
    state.bus.makeHit(
      {
        iwhat: 10,
        dispfr: DX.STAR * 100,
        dispto: nplc * 100 + j,
        ihita: 0, critdv: 0, critdm: 0,
        vfrom: vc, hfrom: hc, vto: base.vPos, hto: base.hPos,
        klflg: 0, shcnfr: 0, shstfr: 0, shcnto: 0, shstto: 0, shjump: 0,
      },
      pridis(state, 30, 30, 100, jbase) & ~state.nomsg,
    );
  }
}

/** Route the per-victim `ihita` score (source 2273–2284). */
function routeBlastScoring(state: GameState, firer: NovaFirer, nplc: number, ihita: number): void {
  // Player victim categories (source uses `5-team` for enemy bases / `3-team` for enemy ships
  // / `team+2` for own bases / `team` for own ships).
  if (firer.player) {
    if (nplc === 5 - firer.team) firer.tpoint[PT.KPBDAM] = (firer.tpoint[PT.KPBDAM] ?? 0) + ihita;
    else if (nplc === 3 - firer.team) firer.tpoint[PT.KPEDAM] = (firer.tpoint[PT.KPEDAM] ?? 0) + ihita;
    else if (nplc === firer.team + 2) firer.tpoint[PT.KPBDAM] = (firer.tpoint[PT.KPBDAM] ?? 0) - ihita;
    else if (nplc === firer.team) firer.tpoint[PT.KPEDAM] = (firer.tpoint[PT.KPEDAM] ?? 0) - ihita;
  } else {
    if (nplc >= DX.FBAS) state.romulan.score[PT.KPBDAM] = (state.romulan.score[PT.KPBDAM] ?? 0) + ihita;
    else if (nplc < DX.FBAS) state.romulan.score[PT.KPEDAM] = (state.romulan.score[PT.KPEDAM] ?? 0) + ihita;
  }
}

/**
 * SNOVA — chain explosion starting at the (already-cleared) star cell (vc, hc).
 *
 * Walks the 3×3 around the star, collecting victims (any class 1..DX.EPLN) into a stack,
 * and chains other stars with `iran(5)==5` (capped at 29 chained stars per the source
 * `strptr .eq. 29` guard). Then processes each victim through `nova(...)` and recurses on
 * chained stars.
 *
 * RNG: one `iran(5)` per other-star in the 3×3.
 */
export function snova(state: GameState, firer: NovaFirer, vcInit: number, hcInit: number): void {
  type StackEntry = { v: number; h: number; disV: number; disH: number };
  const objStack: StackEntry[] = [];
  const starStack: { v: number; h: number }[] = [];
  let vc = vcInit, hc = hcInit;

  // Source DECWAR.FOR:3798 clears the originating star here, at SNOVA entry, so any
  // caller (current or future) can rely on the 3×3 walk not picking it up as a chained
  // star.  Our existing callers (TORP, ROMTOR) also clear it upfront; calling setdsp(0)
  // on an already-empty cell is harmless, so the duplicate is fine for now.
  state.board.setdsp(vcInit, hcInit, 0);

  for (;;) {
    const vLo = Math.max(1, vc - 1), vHi = Math.min(KGALV, vc + 1);
    const hLo = Math.max(1, hc - 1), hHi = Math.min(KGALH, hc + 1);
    for (let V = vLo; V <= vHi; V++) {
      for (let H = hLo; H <= hHi; H++) {
        const obj = state.board.dispc(V, H);
        if (obj >= 1 && obj <= DX.EPLN) {
          objStack.push({ v: V, h: H, disV: V - vc, disH: H - hc });
        } else if (obj === DX.STAR && state.rng.iran(5) !== 5) {
          // Source DECWAR.FOR:3808: `if ((object .ne. DXSTAR) .or. (iran(5) .eq. 5)) goto 300`
          // → chain when object IS a star AND iran(5) IS NOT 5 (i.e. 4/5 of the time). The
          // iran(5) draw fires unconditionally for any star cell.
          if (starStack.length === 29) continue; // source cap
          starStack.push({ v: V, h: H });
          state.board.setdsp(V, H, 0); // clear chained star pre-emptively (source line 3812)
        }
      }
    }

    // Drain victims.
    while (objStack.length > 0) {
      const e = objStack.pop()!;
      const thing = state.board.disp(e.v, e.h);
      // Skip if the cell got cleared or now holds a star (would be processed in the chain loop)
      if (thing <= 0 || thing >= DX.STAR * 100) continue;
      nova(state, firer, Math.trunc(thing / 100), thing % 100, vc, hc, e.disV, e.disH);
    }

    if (starStack.length === 0) return;
    // Pop a chained star and continue the cascade.
    const s = starStack.pop()!;
    vc = s.v; hc = s.h;
    // Emit the iwhat=7 (nova) message and the -500 KNSDES penalty per chained star
    // (source 3826–3831).
    state.bus.makeHit(
      {
        iwhat: 7,
        dispfr: DX.STAR * 100,
        dispto: 0,
        ihita: 0, critdv: 0, critdm: 0,
        vfrom: vc, hfrom: hc, vto: vc, hto: hc,
        klflg: 0, shcnfr: 0, shstfr: 0, shcnto: 0, shstto: 0, shjump: 0,
      },
      pridis(state, vc, hc, KRANGE, 0),
    );
    if (firer.player) firer.tpoint[PT.KNSDES] = (firer.tpoint[PT.KNSDES] ?? 0) - 500;
    else state.romulan.score[PT.KNSDES] = (state.romulan.score[PT.KNSDES] ?? 0) - 500;
  }
}
