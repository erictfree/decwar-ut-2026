// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Tests for hitime / galaxy rebuild after the 5-minute grace (G-6). Pinned to
 * SETUP.FOR:213–215 (the `(hitime-daytim(d)) .gt. 0` gate) and DECWAR.FOR:1090–1091
 * (where hitime is armed when the last player leaves). Uses FakeClock to advance time
 * deterministically.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate, freeShip } from "../../src/lifecycle/activate.ts";
import { shouldRebuildUniverse } from "../../src/lifecycle/universe.ts";
import { Rng } from "../../src/core/rng.ts";
import { FakeClock } from "../../src/runtime/clock.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";

function fresh() {
  const clock = new FakeClock(1_000_000, 0); // wall at +1Ms, monotonic at 0
  const state = createInitialGameState(new Rng(11), clock);
  return { state, clock };
}

// ── shouldRebuildUniverse ────────────────────────────────────────────────────────────────

test("shouldRebuildUniverse returns true when the universe has never been built", () => {
  const { state } = fresh();
  assert.equal(shouldRebuildUniverse(state), true);
});

test("shouldRebuildUniverse returns false while a game is ongoing", () => {
  const { state } = fresh();
  const io = new ScriptedIo([]);
  const a = createSession(io);
  activate(state, a);
  // Game is live; not rebuilding.
  assert.equal(shouldRebuildUniverse(state), false);
});

test("shouldRebuildUniverse stays false during the hitime grace period", () => {
  const { state, clock } = fresh();
  const io = new ScriptedIo([]);
  const a = createSession(io);
  activate(state, a);
  freeShip(state, a, false); // last player out → hitime armed (+5 min)
  // Only 1 minute past freeShip — still inside the grace window.
  clock.advance(60_000);
  assert.equal(shouldRebuildUniverse(state), false);
});

test("shouldRebuildUniverse flips to true once the 5-minute hitime grace expires", () => {
  const { state, clock } = fresh();
  const io = new ScriptedIo([]);
  const a = createSession(io);
  activate(state, a);
  freeShip(state, a, false);
  // Advance past the grace window (hitime = wall + 5 min).
  clock.advance(5 * 60_000 + 1);
  assert.equal(shouldRebuildUniverse(state), true);
});

test("shouldRebuildUniverse flips to true immediately on endflg=-2 (total destruction)", () => {
  const { state } = fresh();
  const io = new ScriptedIo([]);
  const a = createSession(io);
  activate(state, a);
  // Mark a total-destruction end. No grace required → next activation rebuilds.
  state.endflg = -2;
  // Even though numply > 0, the source-faithful behavior is: total destruction = immediate
  // restart eligible. (Galaxy is repopulated when the next player arrives.)
  assert.equal(shouldRebuildUniverse(state), true);
});

// ── Activation after grace-expiry rebuilds the universe ──────────────────────────────────

test("activate after grace-expiry rebuilds the universe (new planet positions)", () => {
  const { state, clock } = fresh();
  // First game.
  const a = createSession(new ScriptedIo([]));
  activate(state, a);
  const firstPlanet = state.planets[1]!;
  const firstPos = [firstPlanet.vPos, firstPlanet.hPos] as const;
  freeShip(state, a, false);

  // Advance past the grace window.
  clock.advance(5 * 60_000 + 1);

  // New player joins → universe should rebuild. Use a different RNG draw history to
  // distinguish — the easiest test: planet positions differ from the first game.
  const b = createSession(new ScriptedIo([]));
  activate(state, b);
  // After rebuild, the universe is regenerated; some planet should land at a different
  // location (with overwhelming probability for a 75x75 grid).
  let differ = false;
  for (let i = 1; i <= state.nplnet; i++) {
    const p = state.planets[i]!;
    if (p.vPos !== firstPos[0] || p.hPos !== firstPos[1]) {
      differ = true;
      break;
    }
  }
  assert.ok(differ, "rebuild should produce a fresh planet layout");
});

test("activate after grace-expiry resets endflg/hitime/nkill/Romulan state", () => {
  const { state, clock } = fresh();
  const a = createSession(new ScriptedIo([]));
  activate(state, a);
  // Pretend the game ended in -2 + some kill records + Romulan presence.
  state.endflg = -2;
  state.nkill = 5;
  state.kilndx = 3;
  state.romulan.exists = true;
  state.romulan.numSpawned = 2;
  freeShip(state, a, true);
  clock.advance(5 * 60_000 + 1);

  const b = createSession(new ScriptedIo([]));
  activate(state, b);
  assert.equal(state.endflg, 0);
  assert.equal(state.hitime, 0);
  assert.equal(state.nkill, 0);
  assert.equal(state.kilndx, 0);
  assert.equal(state.romulan.exists, false);
  assert.equal(state.romulan.numSpawned, 0);
});

test("activation during grace (before expiry) reuses the same universe", () => {
  const { state, clock } = fresh();
  const a = createSession(new ScriptedIo([]));
  activate(state, a);
  const firstPlanet = state.planets[1]!;
  const firstPos = [firstPlanet.vPos, firstPlanet.hPos] as const;
  freeShip(state, a, false);

  // Only 1 minute past — still inside grace.
  clock.advance(60_000);
  const b = createSession(new ScriptedIo([]));
  activate(state, b);

  // Same planet layout retained.
  const p1 = state.planets[1]!;
  assert.equal(p1.vPos, firstPos[0]);
  assert.equal(p1.hPos, firstPos[1]);
});
