// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * `*Zap` — clear the persisted honor-roll statistics. Pre-game command 16
 * (PRECMD.ZAP). Source: `WARMAC.MAC:6156–6193` (`stazap`) + `SETUP.FOR:168–169`
 * (privileged dispatch — runs only when `pasflg` is set).
 *
 * The source's lock+write-zeros+output dance is replaced by a single
 * `state.honor.clear()` — the persistence layer hides the file management.
 * The "Zapping..." / "Finished!" messages are preserved verbatim to keep the
 * faithful CLI feel; the "Can't open file for output!" failure path is omitted
 * because `FileHonorStore.clear()` is best-effort (missing file is treated as
 * already-clear).
 */
import { CRLF, out } from "../render/output.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

const STAZAP_START = "\r\nZapping statistics logs....";
const STAZAP_DONE = "\r\nFinished!\r\n";

export function zap(state: GameState, session: Session): void {
  if (!session.pasflg) return; // SETUP.FOR:168 `if (pasflg) call stazap` — silent when not privileged
  out(session, STAZAP_START);
  state.honor.clear();
  out(session, STAZAP_DONE);
  // Source also calls `gripe` to log the zap event; we drop that — the audit-log
  // hookup belongs with the full gripe-persistence work (F-3 follow-up).
  void CRLF;
}
