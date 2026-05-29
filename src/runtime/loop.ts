// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Per-session read-eval loop — the analog of one TOPS-10 job's `program decwar` command
 * loop (Deliverable #7 §2, Deliverable #13 §7.1).
 *
 * THE INVARIANT (Deliverable #13 §1): the ONLY `await` points are the command-read, the
 * pacing pause, and a handler's bounded argument-prompt read (all at a read seam, never
 * mid-mutation). This single-thread / no-await-in-critical-section discipline reproduces the
 * original's cooperative-scheduling serialization.
 *
 * Per line: drain queues → pause → prompt → read (tolerating the KCMDTM idle heartbeat) → run
 * each `/`-stacked command; after a time-consuming move run the post-move world processing,
 * then check for death. Returns how the session ended so the caller can reincarnate (died) or
 * tear down (quit/hangup).
 */
import { tokenize } from "../parser/tokenizer.ts";
import { executeCommand } from "../commands/executor.ts";
import { postMove } from "./scheduler.ts";
import { renderHit } from "../comms/outhit.ts";
import { renderMsg } from "../comms/outmsg.ts";
import { renderPrompt, CRLF } from "../render/output.ts";
import { MAIN02, SHIP_NAMES, NOQUIT } from "../render/strings.ts";
import { personalizedEndgamBanner } from "../lifecycle/endgam.ts";
import { KCMDTM, KENDAM, COND } from "../core/constants.ts";
import type { GameState } from "../core/state.ts";
import type { Session } from "../core/session.ts";

export type SessionEnd = "quit" | "died" | "hangup";

/** Drain this player's hit + message queues at a boundary (prompt entry, idle heartbeat, between commands). */
function drainQueues(state: GameState, session: Session): void {
  const who = session.who;
  if (who <= 0) return;
  if (state.bus.hasHits(who)) {
    for (const e of state.bus.drainHits(who)) renderHit(state, session, e);
  }
  if (state.bus.hasMsgs(who)) {
    for (const m of state.bus.drainMsgs(who)) session.io.write(renderMsg(state, session, m));
  }
}

function isDead(state: GameState, session: Session): boolean {
  const ship = state.ships[session.who];
  return !!ship && (ship.energy <= 0 || ship.damage >= KENDAM);
}

function announceDeath(state: GameState, session: Session): void {
  const ship = state.ships[session.who];
  const name = SHIP_NAMES[session.who] ?? `Ship #${session.who}`;
  if (ship && ship.energy <= 0) {
    session.io.write(`${CRLF}${name} ${MAIN02}${CRLF}`); // RUNS OUT OF ENERGY!!
  } else {
    session.io.write(`${CRLF}${name} has been destroyed.${CRLF}`);
  }
}

/**
 * If `state.endflg` was set since the last drain, write the per-session personalized
 * banner suffix (the broadcast banner is already in the message queue and drained by
 * the caller). Returns true if the game-end was announced — caller should bail with quit.
 */
function checkEndgam(state: GameState, session: Session): boolean {
  if (state.endflg === 0) return false;
  const suffix = personalizedEndgamBanner(state, session);
  if (suffix) session.io.write(suffix);
  return true;
}

export async function runSession(state: GameState, session: Session): Promise<SessionEnd> {
  while (!session.hungup) {
    drainQueues(state, session);

    // ENDGAM (Phase G-7): if a base/planet kill set endflg, drain the broadcast banner
    // (already done above) and tear down this session. Each session learns about the
    // game-end at its own drain seam — no cross-session state mutation needed.
    if (checkEndgam(state, session)) return "quit";

    // Death can arrive between turns (e.g. an enemy's phaser hit while idle).
    if (isDead(state, session)) {
      announceDeath(state, session);
      return "died";
    }

    if (session.ptime > 0) {
      const ms = session.ptime;
      session.ptime = 0;
      await session.io.pause(ms); // route through the IO seam (instant in tests)
    }

    session.io.write(renderPrompt(state, session));

    session.ccflg = false; // source GETCMD line 1204: CCFLG cleared at the top of the prompt loop

    let line: string | null = null;
    while (line === null && !session.hungup) {
      line = await session.io.readCommandLine(KCMDTM);
      if (line === null) {
        drainQueues(state, session);
        // Idle KCMDTM heartbeat: if the war just ended (via another session's combat or
        // a Romulan kill), announce + bail so the player isn't stuck at the prompt.
        if (checkEndgam(state, session)) return "quit";
      }
    }
    if (session.hungup || line === null) return "hangup";

    // ^C arrived while we were reading (source GETCMD 1228–1232).
    if (session.ccflg) {
      session.ccflg = false;
      const ship = state.ships[session.who];
      if (ship && ship.condition === COND.RED) {
        // RED alert → refuse with `noquit` and clear the input buffer; back to the prompt.
        session.io.write(NOQUIT + CRLF);
        session.lineBuf = "";
        session.bufptr = -1;
        continue;
      }
      // Not RED → ^C forces QUIT (source line 1233; no confirm prompt on this path).
      session.io.write(`${CRLF}Goodbye.${CRLF}`);
      return "quit";
    }

    session.lineBuf = line;
    session.bufptr = 0;
    while (session.bufptr >= 0 && !session.hungup) {
      const res = tokenize(session.lineBuf, session.bufptr);
      session.tokens = res.tokens;
      session.bufptr = res.nextStart;
      if (res.tooMany) {
        session.io.write(`Too many words -- line ignored${CRLF}`);
        break;
      }

      const outcome = await executeCommand(state, session);
      if (outcome.timeConsuming) postMove(state, session, outcome.repair);
      drainQueues(state, session);

      // ENDGAM may have fired inside the command (a torpedo killed the last base, etc.).
      // The broadcast banner is already drained above; emit the personalized suffix here.
      if (checkEndgam(state, session)) return "quit";

      if (isDead(state, session)) {
        announceDeath(state, session);
        return "died"; // caller frees the ship and reincarnates via the lobby
      }
      if (outcome.action === "quit") return "quit";
    }
  }
  return "hangup";
}
