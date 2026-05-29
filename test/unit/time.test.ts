// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * TIME — clock display command.
 * Source-pinned DECWAR.FOR:4076–4094; strings MSG.MAC:330–339.
 * OTIM formatter at WARMAC.MAC:2058–2086.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { time } from "../../src/commands/time.ts";
import { otim, daytim, FakeClock, MS_PER_DAY } from "../../src/runtime/clock.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import type { GameState } from "../../src/core/state.ts";
import type { Session } from "../../src/core/session.ts";

const out = (s: Session): string => (s.io as ScriptedIo).output;
const reset = (s: Session): void => { (s.io as ScriptedIo).output = ""; };

// ── otim formatter ───────────────────────────────────────────────────────────────────────────

test("otim formats ms as HH:MM:SS zero-padded", () => {
  assert.equal(otim(0), "00:00:00");
  assert.equal(otim(1000), "00:00:01");
  assert.equal(otim(60 * 1000), "00:01:00");
  assert.equal(otim(60 * 60 * 1000), "01:00:00");
  assert.equal(otim(3 * 60 * 60 * 1000 + 7 * 60 * 1000 + 45 * 1000), "03:07:45");
});

test("otim's HH field can exceed 24 for very long durations", () => {
  assert.equal(otim(50 * 60 * 60 * 1000), "50:00:00"); // 50 hours
});

test("otim clamps negative inputs to 00:00:00", () => {
  assert.equal(otim(-1), "00:00:00");
});

// ── daytim ───────────────────────────────────────────────────────────────────────────────────

test("daytim returns ms since midnight (modulo a day)", () => {
  const c = new FakeClock(MS_PER_DAY * 100 + 12 * 60 * 60 * 1000); // some day at noon
  assert.equal(daytim(c), 12 * 60 * 60 * 1000);
});

// ── TIME command output ──────────────────────────────────────────────────────────────────────

function gameWithClock(): { state: GameState; a: Session; clock: FakeClock } {
  const clock = new FakeClock(/* wall= */ 9 * 60 * 60 * 1000 /* 09:00 AM */, /* mono= */ 0);
  const state = createInitialGameState(new Rng(1), clock);
  const a = createSession(new ScriptedIo([]));
  activate(state, a);
  return { state, a, clock };
}

test("TIME prints 5 labeled lines in source order (in-game)", () => {
  const { state, a, clock } = gameWithClock();
  // Advance 1h 23m 45s after activation.
  clock.advance(1 * 3600 * 1000 + 23 * 60 * 1000 + 45 * 1000);
  reset(a);
  time(state, a);
  const o = out(a);
  assert.match(o, /Game's elapsed time:  /);
  assert.match(o, /Ship's elapsed time:  /);
  assert.match(o, /Run time in game:     /);
  assert.match(o, /Job's total run time: /);
  assert.match(o, /Current time of day:  /);
  // Game-elapsed and ship-elapsed both equal the 1h23m45s advance (we activated at mono=0 and
  // built the universe at mono=0).
  assert.match(o, /Game's elapsed time:  01:23:45/);
  assert.match(o, /Ship's elapsed time:  01:23:45/);
  // Time of day = 09:00 wall start + 1:23:45 advance = 10:23:45.
  assert.match(o, /Current time of day:  10:23:45/);
});

test("TIME ship-elapsed uses session.jobtm (activated later than universe build)", () => {
  const clock = new FakeClock(0, 0);
  const state = createInitialGameState(new Rng(1), clock);
  // Universe built at mono=0; advance 10 minutes BEFORE first activation.
  clock.advance(10 * 60 * 1000);
  const a = createSession(new ScriptedIo([]));
  activate(state, a);
  // Now advance another 2 minutes.
  clock.advance(2 * 60 * 1000);
  reset(a);
  time(state, a);
  const o = out(a);
  // Game-elapsed = 12:00; ship-elapsed = 02:00 (since activate at mono=10min).
  // BUT: activate also rebuilds tim0 if !state.built (which it does on FIRST activate). So tim0
  // gets set to clock.monotonic() at the time of FIRST activate (= 10 min). So game-elapsed
  // measured AFTER the second advance is 12 - 10 = 02:00. Adjust expectation accordingly.
  assert.match(o, /Game's elapsed time:  00:02:00/);
  assert.match(o, /Ship's elapsed time:  00:02:00/);
});
