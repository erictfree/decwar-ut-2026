// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * ^C CCTRAP state machine — source DECWAR.FOR:1228–1232 (GETCMD loop):
 *   • ^C while NOT RED alert → forces QUIT (no confirm prompt).
 *   • ^C while RED alert → emit NOQUIT + clear buffer + back to prompt.
 *
 * Test mechanics: drive runSession with a queued line that resolves after we synthesize
 * a ^C. The first readCommandLine returns the line, but the ^C signal has already flipped
 * session.ccflg via ScriptedIo.signalCtrlC().
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { runSession } from "../../src/runtime/loop.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import { COND } from "../../src/core/constants.ts";
import type { GameState } from "../../src/core/state.ts";
import type { Session } from "../../src/core/session.ts";

/** A small scripted IO that injects a ^C on the very next readCommandLine() call. */
class CtrlCFirstScriptedIo extends ScriptedIo {
  #ctrlCFired = false;
  override readCommandLine(timeoutMs: number): Promise<string | null> {
    if (!this.#ctrlCFired) {
      this.#ctrlCFired = true;
      this.signalCtrlC(); // flips session.ccflg
      // Return an empty line so the loop's ccflg check fires.
      return Promise.resolve("");
    }
    return super.readCommandLine(timeoutMs);
  }
}

function setup(io: ScriptedIo): { state: GameState; session: Session } {
  const state = createInitialGameState(new Rng(99));
  const session = createSession(io);
  io.onHangup = () => { session.hungup = true; };
  activate(state, session);
  return { state, session };
}

test("^C while not in RED alert forces QUIT (no confirm)", async () => {
  const io = new CtrlCFirstScriptedIo([]); // no further input needed
  const { state, session } = setup(io);
  state.ships[session.who]!.condition = COND.GREEN;
  const end = await runSession(state, session);
  assert.equal(end, "quit");
  assert.match(io.output, /Goodbye\./);
});

test("^C while in RED alert refuses with NOQUIT and stays in the loop", async () => {
  // Inject ^C on first read; subsequent read receives QUIT/YES to actually exit.
  class TwoReadIo extends ScriptedIo {
    #fired = false;
    override readCommandLine(timeoutMs: number): Promise<string | null> {
      if (!this.#fired) {
        this.#fired = true;
        this.signalCtrlC();
        return Promise.resolve(""); // empty line
      }
      return super.readCommandLine(timeoutMs);
    }
  }
  const io = new TwoReadIo(["QUIT", "YES"]);
  const { state, session } = setup(io);
  state.ships[session.who]!.condition = COND.RED;
  const end = await runSession(state, session);
  assert.equal(end, "quit");
  // NOQUIT should have appeared on the wire (RED-alert refusal of ^C).
  assert.match(io.output, /Use QUIT to terminate while under RED alert/);
});

test("ccflg is cleared at the top of each prompt cycle", async () => {
  // Pre-set ccflg before any prompt and ensure a fresh read clears it.
  const io = new ScriptedIo(["STATUS", "QUIT", "YES"]);
  const { state, session } = setup(io);
  session.ccflg = true; // stale flag from before; the loop should clear it at line 1204 analog
  state.ships[session.who]!.condition = COND.GREEN;
  await runSession(state, session);
  // Loop cleared the stale ccflg, then STATUS/QUIT ran normally. (No "forced quit" output.)
  assert.equal(session.ccflg, false);
  void state;
});
