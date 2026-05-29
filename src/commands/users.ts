// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * USERS — list the active captains (ship + side; location if privileged).
 *
 * Source: `DECWAR.FOR:4610–4637`; analysis Deliverable #10 §3.2. Classification: Preserve
 * semantically. Lists ships with `alive < 0` (playing), with a side break after slot KNPLAY/2.
 *
 * SIMPLIFICATION: the original prints captain name / PPN / TTY / baud / job via `stat()` from the
 * host login — the telnet port has no host identity (and SET NAME is deferred), so this lists
 * ship name + side (+ location when PASFLG), with those host fields deferred.
 */
import { CRLF } from "../render/output.ts";
import { prloc } from "../render/format.ts";
import { USERS1, USERS2, USERS5, SHIP_NAMES, FEDERA, EMPIRE } from "../render/strings.ts";
import { KNPLAY, OFLG } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

export function users(state: GameState, session: Session): void {
  let out = CRLF;
  if (session.oflg === OFLG.LONG) {
    out += USERS1 + (session.pasflg ? USERS2 : "") + CRLF;
  }
  const self = state.ships[session.who];
  for (let i = 1; i <= KNPLAY; i++) {
    if (i === KNPLAY / 2 + 1) out += USERS5 + CRLF; // side break
    if ((state.alive[i] ?? 0) >= 0) continue; // only actively-playing ships
    const ship = state.ships[i]!;
    const side = i <= KNPLAY / 2 ? FEDERA : EMPIRE.trim();
    let line = `${(SHIP_NAMES[i] ?? `#${i}`).padEnd(11)}${side}`;
    if (session.pasflg) {
      // DECWAR.FOR:4633 — call spaces(3) then prloc(v, h, 0, w=2, ocflg, SHORT).
      const vS = self?.vPos ?? ship.vPos;
      const hS = self?.hPos ?? ship.hPos;
      line += `   ${prloc(ship.vPos, ship.hPos, 0, 2, session.ocflg, OFLG.SHORT, vS, hS)}`;
    }
    out += line + CRLF;
  }
  session.io.write(out);
}
