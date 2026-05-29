/**
 * MOVE (warp) / IMPULSE — the first time-consuming command.
 *
 * Source: `DECWAR.FOR:2134–2244`; analysis Deliverable #6 §3. Classification: Preserve exactly
 * (energy/fixed-point + the load-bearing RNG draw order).
 *
 * RNG draw order (must match the original exactly):
 *   1. `randam = iran(4000)` — always, up front (the overheat penalty).
 *   2. `d = (ran()-0.5)/2` — only if the computer is critically damaged (course deflection).
 *   3. `tran = iran(100)` — only on warp 5/6 (the overheat test).
 *   4. `ran()` — inside CHECK, once per near-tie cell along the path.
 *
 * Energy cost `ied = 40*ia²`, doubled with shields up, tripled while towing — subtracted from
 * the ×10 energy store. Returns true if a time-consuming move occurred (→ scheduler.postMove),
 * false if the command was rejected or aborted before doing anything.
 */
import { check } from "../movement/check.ts";
import { parseMoveTarget } from "../parser/locate.ts";
import { CRLF } from "../render/output.ts";
import { oflt } from "../render/format.ts";
import {
  WRPDAM,
  IMPDAM,
  MOVE1A,
  MOVE1B,
  MOVE2L,
  MOVE2S,
  MOVE3L,
  MOVE3S,
  MOVE5L,
  MOVE5S,
  MOVE06,
  MOVE08,
  MOVE09,
  MOVE10,
  ENGOFF,
  ERROR1,
  ERROR2,
  STRDAT,
} from "../render/strings.ts";
import { KCRIT, DEV, COND, DX, OFLG } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

export async function move(
  state: GameState,
  session: Session,
  isImpulse: boolean,
): Promise<boolean> {
  const who = session.who;
  const ship = state.ships[who];
  const dev = state.devices[who];
  if (!ship || !dev) return false;

  // Engine-dead guard (≥ KCRIT damage disables the engine).
  if (isImpulse) {
    if ((dev[DEV.KDIMP] ?? 0) >= KCRIT) {
      session.io.write(IMPDAM + CRLF);
      return false;
    }
  } else if ((dev[DEV.KDWARP] ?? 0) >= KCRIT) {
    session.io.write(WRPDAM + CRLF);
    return false;
  }

  const randam = state.rng.iran(4000); // DRAW 1 (always)

  const target = await parseMoveTarget(state, session);
  if (target === null) return false; // aborted / error / hangup

  const iV = target.v - ship.vPos;
  const iH = target.h - ship.hPos;
  if (iV === 0 && iH === 0) {
    session.io.write((session.oflg === OFLG.LONG ? ERROR1 : ERROR2) + CRLF);
    return false;
  }

  ship.condition = COND.GREEN;
  state.docked[who] = 0; // undocked
  const ia = Math.max(Math.abs(iV), Math.abs(iH));

  let d = 0;
  if ((dev[DEV.KDCOMP] ?? 0) >= KCRIT) d = (state.rng.ran() - 0.5) / 2; // DRAW 2 (conditional)

  // Speed limits. Verbosity-aware messages per source DECWAR.FOR:2180–2207 (each warp
  // / impulse refusal has SHORT vs MEDIUM/LONG variants; the engineering officer's
  // long-form lines (MOVE1A, MOVE5L, MOVE09) are only emitted in MEDIUM/LONG).
  const isShort = session.oflg === OFLG.SHORT;
  const isLong = session.oflg === OFLG.LONG;
  if (isImpulse) {
    if (ia !== 1) {
      // Source 2180–2181: LONG prefixes with MOVE1A; all modes emit MOVE1B.
      if (isLong) session.io.write(MOVE1A);
      session.io.write(MOVE1B + CRLF);
      return false;
    }
  } else {
    if (ia > 6) {
      // Source 2187–2191: SHORT/MEDIUM → MOVE3S; LONG → MOVE3L.  Both then append
      // "3." (if KDWARP damaged) or "6." (if intact).
      session.io.write(isLong ? MOVE3L : MOVE3S);
      session.io.write(((dev[DEV.KDWARP] ?? 0) > 0 ? "3." : "6.") + CRLF);
      return false;
    }
    if ((dev[DEV.KDWARP] ?? 0) > 0 && ia > 3) {
      // Source 2183–2186: SHORT/MEDIUM → MOVE2S; LONG → MOVE2L.
      session.io.write((isLong ? MOVE2L : MOVE2S) + CRLF);
      return false;
    }
    if (ia > 4) {
      // warp 5/6 — risk of overheating.  Source 2194–2207:
      //   LONG:    ENGOFF + MOVE5L
      //   MEDIUM:  MOVE5L
      //   SHORT:   MOVE5S
      // On overheat (per the tran probability gate): MOVE06 + oflt(randam,3) + MOVE08
      //   then in MEDIUM/LONG: MOVE09 + oflt(time,2) + STRDAT (where time = randam/30).
      if (isLong) session.io.write(ENGOFF);
      session.io.write((isShort ? MOVE5S : MOVE5L) + CRLF);
      const tran = state.rng.iran(100); // DRAW 3 (conditional)
      if ((tran > 80 && ia >= 6) || (tran > 90 && ia === 5)) {
        session.io.write(MOVE06 + oflt(randam, 3, false) + MOVE08 + CRLF);
        dev[DEV.KDWARP] = (dev[DEV.KDWARP] ?? 0) + randam; // overheat damage
        if (!isShort) {
          // time = randam / 30 (source line 2153); rendered as oflt with bit=2.
          session.io.write(MOVE09 + oflt(Math.trunc(randam / 30), 2, false) + STRDAT + CRLF);
        }
      }
    }
  }

  // Walk the path (consumes ran() on near-tie cells).
  const r = check(state.board, state.rng, ship.vPos, ship.hPos, iV, iH, ia, d);

  // Energy cost: 40*ia², ×2 shields up, ×3 towing.
  let ied = 40 * ia * ia;
  if (ship.shieldCond > 0) ied *= 2;
  if ((state.trstat[who] ?? 0) !== 0) ied *= 3;
  ship.energy -= ied;

  // Move the ship on the board if it actually relocated.
  if (r.v1 !== ship.vPos || r.h1 !== ship.hPos) {
    const oldV = ship.vPos, oldH = ship.hPos;
    state.board.setdsp(oldV, oldH, DX.MPTY * 100); // clear old cell
    state.board.setdsp(r.v1, r.h1, session.team * 100 + who); // new cell = team*100+who
    ship.vPos = r.v1;
    ship.hPos = r.h1;

    // Tow a tractored ship — drag it to one step behind us along the move direction.
    // Source: DECWAR.FOR:2233–2239. `disV/disH` are the per-step deltas computed by CHECK
    // (the dominant axis is ±1, the cross axis is the slope `crossDelta/|dominantDelta|+d`).
    const towed = state.trstat[who] ?? 0;
    if (towed !== 0) {
      const verticalDominant = Math.abs(iH) <= Math.abs(iV);
      const disV = verticalDominant ? Math.sign(iV) : (iV / Math.abs(iH)) + d;
      const disH = verticalDominant ? (iH / Math.abs(iV)) + d : Math.sign(iH);
      const tow = state.ships[towed]!;
      const towV = r.v1 - Math.trunc(disV);
      const towH = r.h1 - Math.trunc(disH);
      const tl = state.board.disp(tow.vPos, tow.hPos);
      state.board.setdsp(tow.vPos, tow.hPos, DX.MPTY * 100); // clear old
      state.board.setdsp(towV, towH, tl);                    // place at new
      tow.vPos = towV;
      tow.hPos = towH;
    }
  }

  if (r.dcode !== 0) session.io.write(MOVE10 + CRLF); // "Collision averted, Captain!"
  // Pause budget — source DECWAR.FOR:2150/2242: `v = etim + slwest*1000 + 1000`, `ptime = v - etim`.
  session.ptime += state.slwest * 1000 + 1000;
  return true; // a time-consuming move occurred
}
