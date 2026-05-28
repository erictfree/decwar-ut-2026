/**
 * Per-turn world processing — the post-move block (`DECWAR.FOR:222–254`).
 *
 * Source: analysis Deliverable #7 §5/§6. Classification: Preserve semantically (the `dotime`
 * race is removed by single-threaded execution, #13 §7.2).
 *
 * Runs synchronously inside the tripping session's handler after a time-consuming move:
 *   1. end-of-turn repair (size 300, all devices);
 *   2. `dotime++`; when it reaches `numply`: reset and fire baspha → plnatk → basbld → romdrv
 *      (a "world tick" once per full round of player moves);
 *   3. per-turn: stardate/turn counters, life-support decay (death if exhausted), score flush;
 *   4. condition downgrade to YELLOW on low energy.
 *
 * STUBS (await the combat / Romulan increments): baspha and plnatk (base/planet phaser
 * defense → PHADAM) and romdrv (Romulan AI). basbld (base rebuild — no combat) is real.
 */
import {
  KCRIT,
  KENDAM,
  KNDEV,
  KNBASE,
  KNPLAY,
  KNPOIN,
  KRANGE,
  DEV,
  DX,
  PT,
  COND,
  TEAM,
  SHIELD_CAP,
} from "../core/constants.ts";
import { ldis, pdist } from "../core/geometry.ts";
import { phadam } from "../combat/damage.ts";
import type { Firer } from "../combat/damage.ts";
import { romdrv, pharom } from "../combat/romulan.ts";
import { pridis } from "../comms/messageBus.ts";
import type { HitEvent } from "../comms/messageBus.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

/** NPC firer context for base/planet defense (ship=false gates out scoring/firer-mod). */
const NPC: Firer = { ship: false, player: false, who: 0, team: TEAM.FED, tpoint: [] };

function blankEvent(): HitEvent {
  return {
    iwhat: 1,
    dispfr: 0,
    dispto: 0,
    ihita: 0,
    critdv: 0,
    critdm: 0,
    vfrom: 0,
    hfrom: 0,
    vto: 0,
    hto: 0,
    klflg: 0,
    shcnfr: 0,
    shstfr: 0,
    shcnto: 0,
    shstto: 0,
    shjump: 0,
  };
}

const YELLOW_ENERGY = 10000; // KSNRGY ≤ 1000.0 → yellow alert

export function postMove(state: GameState, session: Session, doRepair = true): void {
  const who = session.who;
  const ship = state.ships[who];
  const dev = state.devices[who];
  if (!ship || !dev) return;

  if (doRepair) repair(state, who, 3); // 3400 path: end-of-turn repair (size 300); 3500 skips it

  // World tick: once per `numply` time-consuming moves (single in-process round counter).
  state.dotime++;
  if (state.dotime >= state.numply) {
    state.dotime = 0;
    baspha(state, session);
    plnatk(state, session);
    basbld(state, session);
    if (state.romopt) romdrv(state); // Romulan acts (spawn/move/attack)
  }

  // Per-turn counters.
  ship.turns++;
  state.tmturn[session.team] = (state.tmturn[session.team] ?? 0) + 1;

  // Life-support decay: only while the LS device is critically damaged and undocked.
  if ((dev[DEV.KDLIFE] ?? 0) >= KCRIT && (state.docked[who] ?? 0) >= 0) {
    ship.lifeSupport--;
    if (ship.lifeSupport < 0) ship.damage = KENDAM; // life support gone → fatal
  }

  // Score flush: pending tpoint → player score + team score, then zero.
  for (let i = 1; i <= KNPOIN; i++) {
    const pts = session.tpoint[i] ?? 0;
    state.score[i]![who] = (state.score[i]![who] ?? 0) + pts;
    state.tmscor[session.team]![i] = (state.tmscor[session.team]![i] ?? 0) + pts;
    session.tpoint[i] = 0;
  }

  // Condition: yellow alert on low energy (RED comes from combat, a later increment).
  if (ship.damage < KENDAM && ship.energy > 0 && ship.energy <= YELLOW_ENERGY) {
    ship.condition = COND.YELLOW;
  }
}

/** REPAIR: reduce every device's damage by the mode's flat amount (300/500/1000). */
export function repair(state: GameState, who: number, mode: 1 | 2 | 3): void {
  const dev = state.devices[who];
  if (!dev) return;
  const repsiz = mode === 1 ? 500 : mode === 2 ? 1000 : 300;
  let maxd = 0;
  for (let dx = 1; dx <= KNDEV; dx++) maxd = Math.max(maxd, dev[dx] ?? 0);
  if (maxd === 0) return;
  const size = Math.min(repsiz, maxd);
  for (let dx = 1; dx <= KNDEV; dx++) dev[dx] = Math.max((dev[dx] ?? 0) - size, 0);
}

/**
 * BASKIL: walk side `itype`'s ships and undock any that no longer have an adjacent (ldis≤1)
 * friendly base (alive) or friendly captured planet. Source: `DECWAR.FOR:339–369`. Called
 * from CAPTURE (when an enemy planet flips) and from PLNRMV (when a friendly planet vanishes).
 * Undocked ships go RED and `docked[i] = 0`. No RNG.
 */
export function baskil(state: GameState, itype: 1 | 2): void {
  const lo = itype === 1 ? 1 : KNPLAY / 2 + 1;
  const hi = itype === 1 ? KNPLAY / 2 : KNPLAY;
  for (let i = lo; i <= hi; i++) {
    if ((state.docked[i] ?? 0) >= 0) continue; // not docked → leave alone (sign-as-flag: <0 = docked)
    const s = state.ships[i];
    if (!s) continue;

    // Adjacent friendly base?
    let nearPort = false;
    if ((state.nbase[itype] ?? 0) > 0) {
      const bases = state.bases[itype];
      if (bases) {
        for (let j = 1; j <= KNBASE; j++) {
          const b = bases[j];
          if (!b || b.strength <= 0) continue;
          if (ldis(s.vPos, s.hPos, b.vPos, b.hPos, 1)) { nearPort = true; break; }
        }
      }
    }

    // Adjacent friendly planet?
    if (!nearPort && (state.numcap[itype] ?? 0) > 0) {
      for (let j = 1; j <= state.nplnet; j++) {
        const p = state.planets[j];
        if (!p) continue;
        if (state.board.dispc(p.vPos, p.hPos) !== itype + DX.NPLN) continue;
        if (ldis(s.vPos, s.hPos, p.vPos, p.hPos, 1)) { nearPort = true; break; }
      }
    }

    if (!nearPort) {
      s.condition = COND.RED;
      state.docked[i] = 0;
    }
  }
}

/** BASBLD: a player strengthens the enemy's bases by 25/numsid(ownSide), capped at 1000. */
function basbld(state: GameState, session: Session): void {
  const team = session.team;
  const enemy = team === TEAM.FED ? TEAM.EMP : TEAM.FED;
  const n = Math.trunc(25 / Math.max(1, state.numsid[team] ?? 1));
  const bases = state.bases[enemy];
  if (!bases) return;
  for (let i = 1; i <= KNBASE; i++) {
    const b = bases[i];
    if (!b || b.strength <= 0) continue;
    b.strength = Math.min(b.strength + n, SHIELD_CAP);
  }
}

/**
 * BASPHA — the opposite side's starbases fire phasers at the tripping player's ships in range.
 * Source: `DECWAR.FOR:375–428`. Power = 200/numply (scales down with population).
 */
function baspha(state: GameState, session: Session): void {
  const team = session.team;
  const fb = (3 - team) as 1 | 2; // firing side (the enemy's bases)
  if ((state.nbase[fb] ?? 0) <= 0) return;
  const bases = state.bases[fb];
  if (!bases) return;
  const lo = team === TEAM.FED ? 1 : 10; // victim ships = the tripping player's side
  const hi = team === TEAM.FED ? 9 : 18;
  const phit = Math.trunc(200 / state.numply);

  for (let jb = 1; jb <= KNBASE; jb++) {
    const base = bases[jb];
    if (!base || base.strength <= 0) continue;
    for (let k = lo; k <= hi; k++) {
      if ((state.alive[k] ?? 0) >= 0) continue; // playing only (alive < 0)
      const s = state.ships[k];
      if (!s || state.board.disp(s.vPos, s.hPos) <= 0) continue; // cloaked / off-board
      if (!ldis(s.vPos, s.hPos, base.vPos, base.hPos, 4)) continue; // base phaser range = 4
      const id = pdist(base.vPos, base.hPos, s.vPos, s.hPos);
      const dispto = team * 100 + k; // capture before a kill clears the cell
      const r = phadam(state, NPC, team, k, id, phit);
      state.tmscor[fb]![PT.KPEDAM] = (state.tmscor[fb]![PT.KPEDAM] ?? 0) + r.ihita;
      if (r.klflg !== 0) state.tmscor[fb]![PT.KPEKIL] = (state.tmscor[fb]![PT.KPEKIL] ?? 0) + 5000;

      const e = blankEvent();
      e.dispfr = (DX.FBAS + fb - 1) * 100 + jb;
      e.dispto = dispto;
      e.ihita = r.ihita;
      e.critdv = r.critdv;
      e.critdm = r.critdm;
      e.vfrom = base.vPos;
      e.hfrom = base.hPos;
      e.vto = s.vPos;
      e.hto = s.hPos;
      e.klflg = r.klflg;
      e.shcnfr = 1;
      e.shstfr = base.strength;
      e.shcnto = r.shcnto;
      e.shstto = r.shstto;
      const dbits =
        pridis(state, s.vPos, s.hPos, KRANGE, team) |
        pridis(state, s.vPos, s.hPos, 4, 0) |
        (state.bits[k] ?? 0);
      state.bus.makeHit(e, dbits);
    }
  }
}

/**
 * PLNATK — neutral/enemy planets fire at enemy ships in range (2). Neutral planets fire only
 * 50% of the time (`iran(2)`, drawn per neutral planet — load-bearing). Source:
 * `DECWAR.FOR:2788–2847`. Power = (50 + 30*buildCount)/numply.
 */
function plnatk(state: GameState, session: Session): void {
  if (state.nplnet <= 0) return;
  const team = session.team;
  for (let k = 1; k <= state.nplnet; k++) {
    const p = state.planets[k];
    if (!p) continue;
    const pcode = state.board.dispc(p.vPos, p.hPos);
    const pteam = pcode - DX.NPLN; // neutral 0, Fed planet 1, Emp planet 2
    if (pcode === DX.NPLN && state.rng.iran(2) === 1) continue; // 50% neutral skip (DRAW)
    if (pteam === team) continue; // a player's own-side planets don't attack
    const phit = Math.trunc((50 + 30 * p.buildCount) / state.numply);

    for (let j = 1; j <= KNPLAY; j++) {
      const jtype = j <= KNPLAY / 2 ? DX.FPLN : DX.EPLN; // planet type friendly to ship j
      if (pcode === jtype || (state.alive[j] ?? 0) >= 0) continue;
      const s = state.ships[j];
      if (!s || state.board.disp(s.vPos, s.hPos) <= 0) continue;
      if (!ldis(s.vPos, s.hPos, p.vPos, p.hPos, 2)) continue; // planet phaser range = 2
      const id = pdist(p.vPos, p.hPos, s.vPos, s.hPos);
      const dispfr = state.board.disp(p.vPos, p.hPos);
      const dispto = state.board.disp(s.vPos, s.hPos);
      const r = phadam(state, NPC, 2, j, id, phit); // nplc=2 hardcoded in the source
      if (pcode !== DX.NPLN) {
        const t = pteam as 1 | 2;
        state.tmscor[t]![PT.KPEDAM] = (state.tmscor[t]![PT.KPEDAM] ?? 0) + r.ihita;
        if (r.klflg !== 0) state.tmscor[t]![PT.KPEKIL] = (state.tmscor[t]![PT.KPEKIL] ?? 0) + 5000;
      }
      const e = blankEvent();
      e.dispfr = dispfr;
      e.dispto = dispto;
      e.ihita = r.ihita;
      e.critdv = r.critdv;
      e.critdm = r.critdm;
      e.vfrom = p.vPos;
      e.hfrom = p.hPos;
      e.vto = s.vPos;
      e.hto = s.hPos;
      e.klflg = r.klflg;
      e.shstfr = p.buildCount;
      e.shcnto = r.shcnto;
      e.shstto = r.shstto;
      const sideFlag = pteam as 0 | 1 | 2;
      const dbits =
        pridis(state, s.vPos, s.hPos, KRANGE, sideFlag) |
        pridis(state, s.vPos, s.hPos, 4, 0) |
        (state.bits[j] ?? 0);
      state.bus.makeHit(e, dbits);
    }

    // Source DECWAR.FOR:2826–2845 — after firing on ships, each planet also fires on
    // the Romulan if it's alive and within range 2.  Note: the Romulan-target phit is
    // the UNDIVIDED formula (`50 + 30*buildCount`) — no numply divisor (source 2838).
    const rom = state.romulan;
    if (!rom.exists) continue;
    if (!ldis(rom.vPos, rom.hPos, p.vPos, p.hPos, 2)) continue;
    const rphit = 50 + 30 * p.buildCount;
    const rid = pdist(p.vPos, p.hPos, rom.vPos, rom.hPos);
    const rr = pharom(state, rphit, rid);
    if (pcode !== DX.NPLN) {
      const t = pteam as 1 | 2;
      // Source line 2840-2843: damage AND lethal-kill bonus both route to KPRKIL for
      // captured planets attacking the Romulan.
      state.tmscor[t]![PT.KPRKIL] = (state.tmscor[t]![PT.KPRKIL] ?? 0) + rr.ihita;
      if (rr.klflg !== 0) state.tmscor[t]![PT.KPRKIL] = (state.tmscor[t]![PT.KPRKIL] ?? 0) + 5000;
    }
    const re = blankEvent();
    re.dispfr = state.board.disp(p.vPos, p.hPos);
    re.dispto = DX.ROM * 100;
    re.ihita = rr.ihita;
    re.vfrom = p.vPos;
    re.hfrom = p.hPos;
    re.vto = rom.vPos;
    re.hto = rom.hPos;
    re.klflg = rr.klflg;
    re.shstfr = p.buildCount;
    re.shstto = rom.energy;
    re.shcnto = 1;
    const rsideFlag = pteam as 0 | 1 | 2;
    const rdbits =
      pridis(state, rom.vPos, rom.hPos, KRANGE, rsideFlag) |
      pridis(state, rom.vPos, rom.hPos, 4, 0);
    state.bus.makeHit(re, rdbits);
  }
}
