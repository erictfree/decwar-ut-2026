/**
 * The Romulan — a single neutral, hostile NPC that hunts the nearest ship/base of either side.
 *
 * Source: ROMDRV/PHAROM/DEADRO/TOROM `DECWAR.FOR:3220–3384`, DIST `831–883`; analysis
 * Deliverable #11. Classification: Preserve exactly (gates, RNG draw order, integer arithmetic).
 *
 * The Romulan is not a process: ROMDRV runs inside the world-tick of whichever player trips it.
 * RNG draw order is load-bearing — DIST draws iran(2) eagerly three times (FORTRAN `.and.`/`.or.`
 * do not short-circuit); spawn draws iran(5) then iran(200); the spawn taunt draws iran(10).
 *
 * SIMPLIFICATIONS (deferred): torpedo attack (ROMTOR) — the Romulan uses phasers only, and the
 * weapon-choice iran(2) is not drawn; taunts (ROMSPK/TELL); the ROMSTR star-retarget; the
 * obstacle-avoidance back-scan (settles at CHECK's last-clear cell); weapon cooldown gating
 * (consistent with player weapons, also not yet time-gated); the label-1000 re-trigger of
 * baspha/plnatk/basbld (the main world-tick already ran them).
 */
import { place, plnrmv } from "../lifecycle/place.ts";
import { check } from "../movement/check.ts";
import { pdist } from "../core/geometry.ts";
import { pridis } from "../comms/messageBus.ts";
import type { HitEvent } from "../comms/messageBus.ts";
import { phadam, tordam } from "./damage.ts";
import type { Firer } from "./damage.ts";
import { snova } from "./nova.ts";
import { romspkBroadcast } from "./romspk.ts";
import { trcoff } from "../commands/tractor.ts";
import { KGALV, KGALH, KNPLAY, KNBASE, KRANGE, DX, TEAM, PT } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";

const BIG = KGALV * KGALH + 1; // max possible squared distance + 1

interface Target {
  ip: number; // object index
  np: number; // type code: 1 Fed ship, 2 Emp ship, 3 Fed base, 4 Emp base
  num: number; // pdist range
}

/** DIST — nearest visible ship/base of either side; ties broken by eager iran(2). */
function dist(state: GameState): Target {
  const rv = state.romulan.vPos;
  const rh = state.romulan.hPos;
  const z = [BIG, BIG, BIG, BIG];
  const idx = [0, 0, 0, 0];
  const cellV = [0, 0, 0, 0];
  const cellH = [0, 0, 0, 0];

  const consider = (slot: number, j: number, v: number, h: number): void => {
    const zt = (rv - v) * (rv - v) + (rh - h) * (rh - h);
    if (zt < z[slot]!) {
      z[slot] = zt;
      idx[slot] = j;
      cellV[slot] = v;
      cellH[slot] = h;
    }
  };

  for (let j = 1; j <= KNPLAY / 2; j++) {
    const s = state.ships[j];
    if (s && (state.alive[j] ?? 0) < 0 && state.board.disp(s.vPos, s.hPos) > 0) consider(0, j, s.vPos, s.hPos);
  }
  for (let j = KNPLAY / 2 + 1; j <= KNPLAY; j++) {
    const s = state.ships[j];
    if (s && s.vPos !== 0 && state.board.disp(s.vPos, s.hPos) > 0) consider(1, j, s.vPos, s.hPos);
  }
  for (let k = 1; k <= 2; k++) {
    if ((state.nbase[k] ?? 0) <= 0) continue;
    const bases = state.bases[k];
    for (let j = 1; j <= KNBASE; j++) {
      const b = bases?.[j];
      if (b && b.strength > 0 && state.board.disp(b.vPos, b.hPos) !== 0) consider(1 + k, j, b.vPos, b.hPos);
    }
  }

  let np = 1;
  const c1 = state.rng.iran(2) === 1; // eager (drawn regardless of tie)
  if (z[1]! < z[0]! || (z[0]! === z[1]! && c1)) np = 2;
  const c2 = state.rng.iran(2) === 1;
  if (z[2]! < z[np - 1]! || (z[2]! === z[np - 1]! && c2)) np = 3;
  const c3 = state.rng.iran(2) === 1;
  if (z[3]! < z[np - 1]! || (z[3]! === z[np - 1]! && c3)) np = 4;

  return { ip: idx[np - 1]!, np, num: pdist(cellV[np - 1]!, cellH[np - 1]!, rv, rh) };
}

function romFirer(state: GameState): Firer {
  return { ship: true, player: false, who: 0, team: TEAM.FED, tpoint: state.romulan.score };
}

function romEvent(state: GameState, over: Partial<HitEvent>): HitEvent {
  return {
    iwhat: 1, dispfr: DX.ROM * 100, dispto: 0, ihita: 0, critdv: 0, critdm: 0,
    vfrom: state.romulan.vPos, hfrom: state.romulan.hPos, vto: 0, hto: 0, klflg: 0,
    shcnfr: 1, shstfr: state.romulan.energy, shcnto: 0, shstto: 0, shjump: 0, ...over,
  };
}

function targetCell(state: GameState, ip: number, np: number): { i: number; j: number } {
  if (np >= DX.FBAS) {
    const b = state.bases[np - 2]![ip]!;
    return { i: b.vPos, j: b.hPos };
  }
  const s = state.ships[ip]!;
  return { i: s.vPos, j: s.hPos };
}

/** Romulan phaser attack (flat 200-unit hit; torpedoes deferred). */
function romAttack(state: GameState, ip: number, np: number): void {
  const rom = state.romulan;
  const { i, j } = targetCell(state, ip, np);
  rom.moveCounter = 0;

  if (np >= DX.FBAS && (state.bases[np - 2]?.[ip]?.strength ?? 0) === 1000) {
    state.bus.makeHit(
      romEvent(state, { iwhat: 9, dispto: state.board.disp(i, j), vto: i, hto: j }),
      pridis(state, 30, 30, 100, (np - 2) as 1 | 2) & ~state.nomsg,
    );
  }

  const id = pdist(rom.vPos, rom.hPos, i, j);
  const r = phadam(state, romFirer(state), np, ip, id, 200);
  state.bus.makeHit(
    romEvent(state, {
      iwhat: 1, dispto: np * 100 + ip, vto: i, hto: j,
      ihita: r.ihita, critdv: r.critdv, critdm: r.critdm, klflg: r.klflg, shcnto: r.shcnto, shstto: r.shstto,
    }),
    pridis(state, i, j, KRANGE, 0),
  );

  if (np >= DX.FBAS && state.board.disp(i, j) === 0) {
    state.bus.makeHit(
      romEvent(state, { iwhat: 10, dispto: np * 100 + ip, vto: i, hto: j }),
      pridis(state, 30, 30, 100, (np - 2) as 1 | 2) & ~state.nomsg,
    );
  }
}

/**
 * ROMSTR — back-scan the 3×3 around (iV, iH); if a star is adjacent, retarget there.
 * Source: `DECWAR.FOR:3387–3400`. The Romulan uses this to clear obstacles by aiming at a
 * nearby star (so torpedoes can nova it open). No RNG.
 */
function romstr(state: GameState, iV: number, iH: number): { v: number; h: number } {
  const vLo = Math.max(iV - 1, 1), vHi = Math.min(iV + 1, KGALV);
  const hLo = Math.max(iH - 1, 1), hHi = Math.min(iH + 1, KGALH);
  for (let i = vLo; i <= vHi; i++) {
    for (let j = hLo; j <= hHi; j++) {
      if (state.board.dispc(i, j) === DX.STAR) return { v: i, h: j };
    }
  }
  return { v: iV, h: iH };
}

/**
 * ROMTOR — Romulan torpedo burst (up to 3 torpedoes), with per-torp misfire and retarget.
 *
 * Source: `DECWAR.FOR:3404–3499`. Per-torp RNG draws in order:
 *   1. `ran()` — deflection `d = (ran-0.5)/2.5`
 *   2. `iran(100)` — misfire check (`>96` → misfir=-1; torp 2/3 abort)
 *   3. (only if misfir<0 NOW) `ran()` — extra deflection
 *   4. `ran()` — `idis = KRANGE-2 + int((ran-0.5)*4 + 0.5)` (range)
 *   5. CHECK along the path (consumes its own RNG on near-tie cells)
 *   6. `iran(100)` — `aran` (for star nova / planet build-reduction gates)
 *   7. After-hit retarget calls `dist()` which eagerly draws 3 × `iran(2)`.
 *
 * Path branches mirror player TORP: star+aran≤80 → snova (Romulan may blow himself up — see
 * source 3432); star+aran>80 → retarget; black hole → retarget; planet → `aran≥75` decrements
 * buildCount, `<0` triggers `plnrmv` + `rsr[KNPDES] -= 1000`; ship/base → `tordam` (firer is
 * Romulan: ship=true, player=false → scoring goes into `rsr` via the existing path). Base at
 * full strength emits iwhat=9; base destroyed emits iwhat=10.
 *
 * Pacing `rtpaus` is updated at exit (source line 3497) but the time gate isn't enforced yet
 * (consistent with the deferred cooldown story in Phase E).
 */
export function romtor(state: GameState, iV1: number, iH1: number): void {
  const rom = state.romulan;
  const rng = state.rng;
  let misfir = 0;
  let tpaus = 0;

  for (let id = 1; id <= 3; id++) {
    let d = (rng.ran() - 0.5) / 2.5; // DRAW 1 (always)
    if (misfir < 0) break; // earlier misfire → goto 900
    if (rng.iran(100) > 96) misfir = -1; // DRAW 2
    if (misfir < 0) d += (rng.ran() - 0.5) / 5.0; // DRAW 3 (conditional)

    const idis = KRANGE - 2 + Math.trunc((rng.ran() - 0.5) * 4.0 + 0.5); // DRAW 4
    tpaus += (state.slwest + 1) * 1000;

    const r = check(state.board, rng, rom.vPos, rom.hPos, iV1, iH1, idis, d);
    if (r.dcode === 0) continue; // miss → next torp (goto 800)

    const aran = rng.iran(100); // DRAW 5
    const nplc = Math.trunc(r.dcode / 100);
    const j = r.dcode % 100;
    const firer = romFirer(state);

    if (nplc === DX.STAR) {
      if (aran > 80) {
        // Star unaffected — fall through to retarget (goto 300)
      } else {
        // Star novas (source 3424–3433).
        state.board.setdsp(r.v2, r.h2, 0);
        state.bus.makeHit(
          romEvent(state, { iwhat: 7, vfrom: r.v2, hfrom: r.h2, vto: r.v2, hto: r.h2 }),
          pridis(state, r.v2, r.h2, KRANGE, 0),
        );
        state.romulan.score[PT.KNSDES] = (state.romulan.score[PT.KNSDES] ?? 0) - 500;
        snova(state, { player: false, team: TEAM.FED, tpoint: state.romulan.score }, r.v2, r.h2);
        if (!rom.exists) return; // Romulan blew himself up (source line 3432)
      }
    } else if (nplc === DX.BHOL) {
      // Black hole → retarget (goto 300), no message in source
    } else if (nplc >= DX.NPLN && nplc <= DX.EPLN) {
      // Planet branch (source label 600).
      const planet = state.planets[j];
      if (planet) {
        if (aran >= 75) planet.buildCount -= 1;
        const shstto = Math.max(planet.buildCount, 0);
        let klflg: 0 | 2 = 0;
        if (planet.buildCount < 0) {
          klflg = 2;
          const pteam = nplc - DX.NPLN;
          state.board.setdsp(r.v2, r.h2, 0);
          state.romulan.score[PT.KNPDES] = (state.romulan.score[PT.KNPDES] ?? 0) - 1000;
          plnrmv(state, j, pteam);
        }
        state.bus.makeHit(
          romEvent(state, {
            iwhat: 2, dispto: r.dcode,
            vto: r.v2, hto: r.h2, klflg,
            shcnto: 0, shstto,
          }),
          pridis(state, r.v2, r.h2, KRANGE, 0),
        );
      }
    } else {
      // Ship or base (source label 100/200).
      // Base at full strength: iwhat=9 galaxy-wide alert.
      if (nplc >= DX.FBAS && (state.bases[nplc - 2]?.[j]?.strength ?? 0) === 1000) {
        state.bus.makeHit(
          romEvent(state, { iwhat: 9, dispto: r.dcode, vto: r.v2, hto: r.h2 }),
          pridis(state, 30, 30, 100, (nplc - 2) as 1 | 2) & ~state.nomsg,
        );
      }
      const result = tordam(state, firer, nplc, j);
      state.bus.makeHit(
        romEvent(state, {
          iwhat: result.iwhat, dispto: r.dcode,
          vto: r.v2, hto: r.h2, klflg: result.klflg,
          ihita: result.ihita, critdv: result.critdv, critdm: result.critdm,
          shcnto: result.shcnto, shstto: result.shstto,
        }),
        pridis(state, r.v2, r.h2, KRANGE, 0),
      );
      if (nplc < DX.FBAS && (state.trstat[j] ?? 0) !== 0) trcoff(state, j);
      // Base destroyed?
      if (nplc >= DX.FBAS && state.board.disp(r.v2, r.h2) === 0) {
        state.bus.makeHit(
          romEvent(state, { iwhat: 10, dispto: r.dcode, vto: r.v2, hto: r.h2 }),
          pridis(state, 30, 30, 100, (nplc - 2) as 1 | 2) & ~state.nomsg,
        );
      }
    }

    // ── Retarget (source label 300) ───────────────────────────────────────────────────────
    const t = dist(state);
    if (t.num > KRANGE) break; // goto 900
    const tc = targetCell(state, t.ip, t.np);
    const star = romstr(state, tc.i, tc.j);
    iV1 = star.v - rom.vPos;
    iH1 = star.h - rom.hPos;
  }
  // rtpaus would be updated here (source 3497) — gating deferred.
  void tpaus;
}

function oneShort(romC: number, targetC: number): number {
  const d = targetC - romC;
  if (d < 0) return romC - (Math.abs(d) - 1);
  if (d > 0) return romC + (Math.abs(d) - 1);
  return romC;
}

/**
 * Pick the Romulan's weapon and fire. Source line 3260: `goto (600, 700) iran(2)` with both
 * weapons ready (cooldown gating deferred — we draw `iran(2)` unconditionally to preserve the
 * RNG order). 1 → torpedoes (label 600), 2 → phasers (label 700).
 */
function romFire(state: GameState, ip: number, np: number): void {
  const choice = state.rng.iran(2); // DRAW (load-bearing)
  if (choice === 1) {
    // Torpedoes — ROMSTR adjusts target to a nearby star if possible, then ROMTOR fires.
    const { i, j } = targetCell(state, ip, np);
    const star = romstr(state, i, j);
    const rom = state.romulan;
    romtor(state, star.v - rom.vPos, star.h - rom.hPos);
  } else {
    romAttack(state, ip, np);
  }
}

/** Move up to warp 4 toward the target, stopping one short, then attack if in range. */
function moveAndAttack(state: GameState): void {
  const rom = state.romulan;
  let t = dist(state);
  if (t.num <= 1) {
    romFire(state, t.ip, t.np);
    return;
  }
  const { i, j } = targetCell(state, t.ip, t.np);
  const destV = oneShort(rom.vPos, i);
  const destH = oneShort(rom.hPos, j);
  const l = Math.min(4, t.num);
  const r = check(state.board, state.rng, rom.vPos, rom.hPos, destV - rom.vPos, destH - rom.hPos, l, 0);
  state.board.setdsp(rom.vPos, rom.hPos, 0);
  state.board.setdsp(r.v1, r.h1, DX.ROM * 100);
  rom.vPos = r.v1;
  rom.hPos = r.h1;

  t = dist(state);
  if (t.num <= KRANGE) romFire(state, t.ip, t.np);
  else rom.moveCounter = 0;
}

/** ROMDRV — one Romulan action per qualifying world tick. */
export function romdrv(state: GameState): void {
  const rom = state.romulan;
  rom.moveCounter += 1;
  if (rom.moveCounter * 2 < state.numply) return; // self-gate
  state.tmturn[3] = (state.tmturn[3] ?? 0) + 1;

  if (!rom.exists) {
    const r5 = state.rng.iran(5); // eager
    if (rom.moveCounter < state.numply * 3 || r5 === 5) return; // spawn deferred
    rom.moveCounter = 0;
    const c = place(state, DX.ROM * 100 + 1, 1);
    rom.vPos = c.v;
    rom.hPos = c.h;
    rom.exists = true;
    rom.energy = state.rng.iran(200) + 200;
    rom.numSpawned += 1;
    state.bus.makeHit(
      romEvent(state, { iwhat: 11, vfrom: c.v, hfrom: c.h, vto: c.v, hto: c.h }),
      pridis(state, c.v, c.h, KRANGE, 0),
    );
    if (state.rng.iran(10) === 1) romspkBroadcast(state); // 1-in-10 spawn taunt (G-4)
    const t = dist(state);
    if (t.num <= KRANGE) romFire(state, t.ip, t.np);
    return;
  }
  moveAndAttack(state);
}

// ── the Romulan as a target ─────────────────────────────────────────────────────────────────

/** PHAROM — a phaser hit on the Romulan. `erom` is its health/shield pool. */
export function pharom(state: GameState, phit: number, id: number): { ihita: number; klflg: number } {
  const ihita = Math.trunc(((100 + state.rng.iran(100)) * phit) / (10 * id));
  state.romulan.energy -= Math.trunc(ihita / 10);
  if (state.romulan.energy > 0) return { ihita, klflg: 0 };
  deadro(state);
  return { ihita, klflg: 2 };
}

/** TOROM — a torpedo hit on the Romulan. */
export function torom(state: GameState): { ihita: number; klflg: number } {
  const ihita = Math.min(state.rng.iran(4000), 2000);
  state.romulan.energy -= Math.trunc(ihita / 10);
  if (state.romulan.energy <= 0) {
    deadro(state);
    return { ihita, klflg: 2 };
  }
  return { ihita, klflg: 0 };
}

/** DEADRO — the Romulan dies: clear its cell, mark absent. */
export function deadro(state: GameState): void {
  state.romulan.exists = false;
  state.board.setdsp(state.romulan.vPos, state.romulan.hPos, 0);
}
