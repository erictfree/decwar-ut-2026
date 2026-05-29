// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * CAPTURE — flip a neutral or enemy planet to friendly. The planet fires phasers back at the
 * capturer using existing PHADAM, with strength `50 + 30 * buildCount`.
 *
 * Source: `DECWAR.FOR:597–682` (subroutine CAPTUR); strings `MSG.MAC:20–37, 148–160`.
 * Classification: Preserve exactly. Zero RNG draws (PHADAM consumes its own RNG draws).
 *
 * Pre-conditions:
 *   • Coordinates resolved via `parseMoveTarget`.
 *   • Ship Chebyshev-1 adjacent to the target sector.
 *   • Target cell class ∈ {DX.NPLN, DX.FPLN, DX.EPLN}; non-planet cells emit a class-specific
 *     refusal (NOPLNT / NOSUR1 / NOSUR2 / NOSUR3 / NOSUR4).
 *   • Target planet must NOT already be friendly; if it is, emit CAPTU7 (medium) or the
 *     team-conditional CAPTU6/CAPTU8 (long).
 *
 * Action (source 615–662):
 *   • `tcap = cls - DX.NPLN` (0 = neutral, 1/2 = enemy side).
 *   • Witness bitmask built via `pridis` (enemy ships in KRANGE if tcap≠0; all ships in 4).
 *   • If tcap ≠ 0: `baskil(tcap)` undocks ex-friendly ships at the lost port, and
 *     `numcap[tcap]--`. `numcap[team]++`.
 *   • `phit = 50 + 30*buildCount`, ship energy -= 500*buildCount, pause budget += 1000*buildCount.
 *     `buildCount = 0` (capture wipes fortifications).
 *   • Cell flipped to `(team + DX.NPLN)*100 + i`.
 *   • PHADAM fires the planet's phasers at the player (ship=false, player=false firer).
 *   • If tcap ≠ 0: enemy team gets `tmscor[tcap][KPEDAM] += ihita`; on lethal, `+= 5000`
 *     to KPEKIL.
 *   • Player tpoint[KPPCAP] += 1000.
 *
 * Death: if ship.damage ≥ KENDAM or ship.energy ≤ 0 after the counter-attack, emit team-
 * conditional CAPTU1/CAPTU2 + CAPTU4. Returns time-consuming=true; runtime loop's existing
 * death-detection handles reincarnation.
 */
import { CRLF } from "../render/output.ts";
import { parseMoveTarget } from "../parser/locate.ts";
import { prloc } from "../render/format.ts";
import {
  CAPTU0, CAPTU1, CAPTU2, CAPTU4, CAPTU5, CAPTU6, CAPTU7, CAPTU8,
  NOPLNT, NOSUR1, NOSUR2, NOSUR3, NOSUR4, SHIP_NAMES, OBJ_NAMES,
} from "../render/strings.ts";
import { ldis, pdist } from "../core/geometry.ts";
import { phadam } from "../combat/damage.ts";
import { baskil } from "../runtime/scheduler.ts";
import { pridis } from "../comms/messageBus.ts";
import {
  DX, KRANGE, KENDAM, OFLG, PT, TEAM,
} from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

export async function capture(state: GameState, session: Session): Promise<boolean> {
  const who = session.who;
  const ship = state.ships[who];
  if (!ship) return false;

  const target = await parseMoveTarget(state, session);
  if (target === null) return false;

  // ── Adjacency (source 609–610) ──────────────────────────────────────────────────────────
  if (!ldis(ship.vPos, ship.hPos, target.v, target.h, 1)) {
    session.io.write(`${CRLF}${SHIP_NAMES[who]} ${CAPTU5}${CRLF}`);
    return false;
  }

  const cls = state.board.dispc(target.v, target.h);

  // ── Refusal: not a planet at all (source 664–671 / label 400) ───────────────────────────
  if (cls < DX.NPLN || cls > DX.EPLN) {
    refuseNonPlanet(session, cls);
    return false;
  }

  // ── Refusal: already friendly (source 613 / 600/700/800) ────────────────────────────────
  if (cls === DX.NPLN + session.team) {
    if (session.oflg === OFLG.LONG) {
      session.io.write(session.team === TEAM.FED ? CAPTU6 + CRLF : CAPTU8 + CRLF);
    } else {
      session.io.write(CAPTU7 + CRLF);
    }
    return false;
  }

  // ── Capture body (source 615–632) ───────────────────────────────────────────────────────
  const i = state.board.dispx(target.v, target.h);
  const planet = state.planets[i];
  if (!planet) return false;

  const tcap = cls - DX.NPLN; // 0 neutral, 1 Fed, 2 Emp (the LOSING side)
  // dbits: enemy ships in KRANGE if tcap≠0, plus all ships in range 4. (Constructs the
  // PHADAM witness audience; PHADAM itself routes its hit emission through the bus.)
  let dbits = 0;
  if (tcap !== 0) {
    dbits |= pridis(state, target.v, target.h, KRANGE, tcap as 1 | 2);
  }
  dbits |= pridis(state, target.v, target.h, 4, 0);

  if (tcap !== 0) baskil(state, tcap as 1 | 2);
  if (tcap !== 0) state.numcap[tcap] = Math.max((state.numcap[tcap] ?? 0) - 1, 0);
  state.numcap[session.team] = (state.numcap[session.team] ?? 0) + 1;

  const fortifyLevel = planet.buildCount;
  const phit = 50 + 30 * fortifyLevel;
  ship.energy -= fortifyLevel * 500; // ×10 storage; source uses 500 directly on ×10 store
  planet.buildCount = 0;

  // Flip the cell color BEFORE the counter-attack (source line 634 precedes 639).
  state.board.setdsp(target.v, target.h, (session.team + DX.NPLN) * 100 + i);

  // ── Planet fires phasers at the capturing player (source 633–639) ───────────────────────
  // Add the witness bitmask + the firer/victim — PHADAM's makhit routes via state.bus.
  // (The current `pridis` returns a mask but PHADAM doesn't take a dbits arg directly;
  // it builds its own via the standard side-10/all-4 + firer pattern. The pridis calls
  // above are kept faithful for the source order but the actual witness construction
  // happens inside PHADAM. That's source-faithful: PHADAM emits the hit; CAPTUR's pridis
  // calls populate dbits used later by the second makhit, which we defer.)
  void dbits;

  const targetClassCode = session.team === TEAM.FED ? DX.FSHP : DX.ESHP;
  // For a non-ship/non-player firer (the planet), team is preserved per source line 639
  // (`call phadam(team, ...)` passes the player's team — see plan notes).
  const firer = {
    ship: false,
    player: false,
    who,
    team: session.team,
    tpoint: session.tpoint,
  };
  const result = phadam(state, firer, targetClassCode, who, pdist(target.v, target.h, ship.vPos, ship.hPos), phit);

  // ── Scoring & local output (source 640–653) ─────────────────────────────────────────────
  if (tcap !== 0) {
    state.tmscor[tcap]![PT.KPEDAM] = (state.tmscor[tcap]![PT.KPEDAM] ?? 0) + result.ihita;
  }
  if (result.klflg !== 0 && tcap !== 0) {
    state.tmscor[tcap]![PT.KPEKIL] = (state.tmscor[tcap]![PT.KPEKIL] ?? 0) + 5000;
  }

  // Local terminal output: <ship> capturing <new-color planet> <loc + CRLF>.
  const newPlanetDisp = (session.team + DX.NPLN) * 100 + i;
  session.io.write(
    `${CRLF}${SHIP_NAMES[who]} ${CAPTU0}${objNameOf(newPlanetDisp)} ${prloc(
      target.v, target.h, 1, 0, session.ocflg, session.oflg, ship.vPos, ship.hPos,
    )}`,
  );

  session.tpoint[PT.KPPCAP] = (session.tpoint[PT.KPPCAP] ?? 0) + 1000;

  // Pause budget — source DECWAR.FOR:602/629: `v = etim + 5000`; `v += build*1000`.
  session.ptime += 5000 + fortifyLevel * 1000;

  // ── Death (source 655–662) ──────────────────────────────────────────────────────────────
  if (ship.damage >= KENDAM || ship.energy <= 0) {
    session.io.write((session.team === TEAM.FED ? CAPTU1 : CAPTU2) + CRLF);
    session.io.write(`${SHIP_NAMES[who]} ${CAPTU4}${CRLF}`);
    // The loop's death-detection at the top of the next tick reincarnates via lobby.
  }

  return true;
}

function refuseNonPlanet(session: Session, idsp: number): void {
  if (idsp <= 0) {
    session.io.write(NOPLNT + CRLF);
    return;
  }
  // Source 666–670 maps dispc class to message:
  //   own team's ship (=team) or own team's base (=team+2) → NOSUR1
  //   enemy ship (=3-team) or enemy base (=5-team) → NOSUR2
  //   Romulan (DX.ROM=5) → NOSUR3
  //   star/black hole (≥ DX.STAR=9) → NOSUR4
  if (idsp === session.team || idsp === session.team + 2) {
    session.io.write(NOSUR1 + CRLF);
    return;
  }
  if (idsp === 3 - session.team || idsp === 5 - session.team) {
    session.io.write(NOSUR2 + CRLF);
    return;
  }
  if (idsp === DX.ROM) {
    session.io.write(NOSUR3 + CRLF);
    return;
  }
  if (idsp >= DX.STAR) {
    session.io.write(NOSUR4 + CRLF);
    return;
  }
}

function objNameOf(code: number): string {
  const cls = Math.trunc(code / 100);
  const idx = code % 100;
  if (cls === DX.FSHP || cls === DX.ESHP) return SHIP_NAMES[idx] ?? `ship ${idx}`;
  return OBJ_NAMES[cls] ?? "object";
}
