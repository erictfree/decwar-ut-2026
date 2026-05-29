// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * ENDGAM — detect game-end conditions and broadcast the result.
 *
 * Source: `DECWAR.FOR:955–1000` (subroutine ENDGAM). The original is called whenever a
 * base or planet is destroyed (call sites at GETCMD 1203, TORDAM 1222/3709, ROMDEST 2876,
 * SETUP KILCHK 74). It checks two conditions:
 *
 *   • `nplnet > 0` → planets remain → return (game continues)
 *   • `min(nbase[1], nbase[2]) > 0` → both sides still have bases → return
 *
 * Otherwise the war is over. `endflg` becomes truthy (1 = decisive win, -2 = total
 * destruction when nplnet+nbase[1]+nbase[2] are ALL zero). The source prints the banner
 * to the calling player and forces an exit; the TS port broadcasts via `state.bus.makeMsg`
 * to ALL_MASK so idle sessions pick up the banner at their next KCMDTM drain heartbeat
 * (≤2s latency). Each session's `runSession` checks `state.endflg !== 0` at the heartbeat
 * and tears its own connection down — preserving the no-await-in-critical-section
 * invariant (see Phase G plan §D Risk 1).
 *
 * `endgam()` itself MUST be safe to call from inside a mid-mutation command (e.g.
 * `tordam` returning `klflg === 2`). It only mutates `state.endflg` and enqueues messages;
 * no `freeShip`, no `await`, no cross-session state pokes.
 */
import { CRLF } from "../render/output.ts";
import {
  ENDGM0, ENDGM1, ENDGM3, ENDGM4, ENDGM5, ENDGM6, ENDGM7, ENDGM8,
} from "../render/strings.ts";
import { DX, KNPLAY, TEAM } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

const ALL_MASK = (1 << KNPLAY) - 1;

/**
 * Build the ENDGAM banner body — a multi-line string mirroring the `call out (endgmN, 1)`
 * cascade at source lines 969–978. The session-specific endgm5..endgm8 ("Please proceed
 * to the nearest Klingon slave planet" etc.) are personalized per recipient, so the
 * banner is composed per-session at drain time (not here). This function builds only the
 * shared banner — base/planet/empire/federation announcements.
 */
function bannerBase(state: GameState): string {
  const parts: string[] = [ENDGM0];
  // Source 970: if everything is wiped (nplnet + nbase[1] + nbase[2] all zero), print
  // endgm1 and mark total destruction (-2).
  if (state.endflg === -2) parts.push(ENDGM1);
  // Source 973–974: per-side base-destroyed banners.
  if ((state.nbase[1] ?? 0) === 0) parts.push(ENDGM3);
  if ((state.nbase[2] ?? 0) === 0) parts.push(ENDGM4);
  return parts.join(CRLF);
}

/**
 * Per-session personalized banner suffix — source 975–978 selects ONE of endgm5..endgm8
 * based on the session's team and which side lost its bases.
 */
function personalSuffix(state: GameState, team: 1 | 2): string {
  const fedDead = (state.nbase[1] ?? 0) === 0;
  const empDead = (state.nbase[2] ?? 0) === 0;
  if (team === TEAM.FED) {
    if (fedDead) return ENDGM5; // your side fell
    if (empDead) return ENDGM6; // enemy fell
  } else {
    if (fedDead) return ENDGM7; // enemy fell (Empire wins)
    if (empDead) return ENDGM8; // your side fell
  }
  return "";
}

/**
 * Run the end-of-game check after a base or planet kill. Returns `true` when ENDGAM
 * triggered termination (caller can use this to short-circuit further work). Idempotent
 * — repeated calls after `endflg` is set are no-ops.
 */
export function endgam(state: GameState): boolean {
  // Source 963: already over → just print (in the source). In our port, idempotent.
  if (state.endflg !== 0) return true;

  // Source 964: still planets → game continues.
  if (state.nplnet > 0) return false;
  // Source 965: both sides still have bases → game continues.
  const fedBases = state.nbase[1] ?? 0;
  const empBases = state.nbase[2] ?? 0;
  if (Math.min(fedBases, empBases) > 0) return false;

  // The war is over. Source 968: endflg = .true. (1). Total destruction (970–972) sets -2.
  state.endflg = (Math.max(state.nplnet, fedBases, empBases) === 0) ? -2 : 1;

  // Broadcast the shared banner via the messageBus. Each session sees it at the next
  // KCMDTM heartbeat; the per-session personalized suffix is appended at drain time by
  // `personalizedEndgamBanner` so each player sees the right endgm5–endgm8 line.
  state.bus.makeMsg(
    {
      dispfr: DX.MPTY * 100, // a system broadcast — OUTMSG renders sender as "object"
      recipients: ALL_MASK,
      body: bannerBase(state),
    },
    ALL_MASK,
  );

  return true;
}

/**
 * Builds the full personalized banner for `session` to write at game-end. The caller
 * (the runtime loop's endflg check) writes this AFTER draining the bus broadcast so the
 * player sees: <generic banner> then <personalized suffix>.
 */
export function personalizedEndgamBanner(state: GameState, session: Session): string {
  const suffix = personalSuffix(state, session.team);
  if (suffix === "") return "";
  return suffix + CRLF;
}
