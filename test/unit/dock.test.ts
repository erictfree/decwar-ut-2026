// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * DOCK — refit at an adjacent friendly base or captured planet.
 * Source-pinned DECWAR.FOR:888–933; strings MSG.MAC:47–49.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { dock } from "../../src/commands/dock.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import { COND, KNTORP_MAX, ENERGY_CAP, SHIELD_CAP, KLFSUP_MAX, DX } from "../../src/core/constants.ts";
import type { GameState } from "../../src/core/state.ts";
import type { Session } from "../../src/core/session.ts";

function fresh(): { state: GameState; a: Session } {
  const state = createInitialGameState(new Rng(1));
  const a = createSession(new ScriptedIo([]));
  activate(state, a);
  return { state, a };
}
const out = (s: Session): string => (s.io as ScriptedIo).output;
const reset = (s: Session): void => { (s.io as ScriptedIo).output = ""; };
const setArgs = (s: Session, line: string): void => {
  s.tokens = tokenize(line, 0).tokens;
};

/** Move a friendly base next to the player's ship so DOCK has a target. */
function placeAdjacentBase(state: GameState, session: Session): void {
  const ship = state.ships[session.who]!;
  // Pick the side's slot 1 base; reposition to (v+1, h) — Chebyshev 1.
  const b = state.bases[session.team]![1]!;
  b.vPos = ship.vPos + 1;
  b.hPos = ship.hPos;
  b.strength = 1000;
}

test("DOCK at an adjacent friendly base refits the ship (ifract=2, double-restore)", () => {
  const { state, a } = fresh();
  placeAdjacentBase(state, a);
  const ship = state.ships[a.who]!;
  ship.torps = 0;
  ship.energy = 0;
  ship.shieldPct = 0;
  ship.damage = 5000;
  ship.lifeSupport = 0;
  setArgs(a, "DOCK");
  reset(a);
  const time = dock(state, a);
  assert.equal(time, true, "DOCK is time-consuming on success");
  assert.equal(ship.torps, Math.min(0 + 5 * 2, KNTORP_MAX));
  assert.equal(ship.energy, Math.min(0 + 5000 * 2, ENERGY_CAP));
  assert.equal(ship.shieldPct, Math.min(0 + 100 * 2, SHIELD_CAP));
  assert.equal(ship.damage, Math.max(5000 - 500 * 2, 0));
  assert.equal(ship.lifeSupport, KLFSUP_MAX);
  assert.equal(ship.condition, COND.GREEN);
  assert.ok((state.docked[a.who] ?? 0) < 0, "docked sign-flag set");
  assert.match(out(a), /DOCKED\./);
});

test("DOCK at an adjacent friendly planet contributes ifract=1 only", () => {
  const { state, a } = fresh();
  // Move slot-1 planet next to player, mark it as friendly-captured.
  const ship = state.ships[a.who]!;
  const planet = state.planets[1]!;
  planet.vPos = ship.vPos - 1;
  planet.hPos = ship.hPos;
  state.board.setdsp(planet.vPos, planet.hPos, (DX.NPLN + a.team) * 100 + 1);
  state.numcap[a.team] = 1;
  // Remove all bases from range by zeroing strength.
  for (let j = 1; j <= 10; j++) {
    state.bases[a.team]![j]!.strength = 0;
    state.bases[3 - a.team]![j]!.strength = 0;
  }
  ship.torps = 0;
  ship.energy = 0;
  setArgs(a, "DOCK");
  reset(a);
  const time = dock(state, a);
  assert.equal(time, true);
  assert.equal(ship.torps, 5, "planet contributes ifract=1 → +5 torps");
  assert.equal(ship.energy, 5000);
});

test("DOCK with no friendly port in range refuses + DOCK01", () => {
  const { state, a } = fresh();
  // Move all bases away from the player.
  const ship = state.ships[a.who]!;
  for (let j = 1; j <= 10; j++) {
    state.bases[a.team]![j]!.strength = 0;
    state.bases[3 - a.team]![j]!.strength = 0;
  }
  state.numcap[a.team] = 0;
  ship.torps = 0;
  ship.energy = 0;
  setArgs(a, "DOCK");
  reset(a);
  const time = dock(state, a);
  assert.equal(time, false, "non-time-consuming on no-port");
  assert.equal(ship.torps, 0, "no refit");
  assert.equal(ship.energy, 0);
  assert.equal(state.docked[a.who] ?? 0, 0, "not docked");
  assert.match(out(a), /not adjacent to base/);
});

test("DOCK while already docked heals damage twice (source quirk preserved)", () => {
  const { state, a } = fresh();
  placeAdjacentBase(state, a);
  const ship = state.ships[a.who]!;
  state.docked[a.who] = -1; // already docked
  ship.damage = 5000;
  setArgs(a, "DOCK");
  reset(a);
  dock(state, a);
  // ifract=2 from the base → -500*2 = -1000, then -500*2 again on the already-docked path
  // → 5000 - 2000 = 3000.
  assert.equal(ship.damage, 3000);
});

test("DOCK STATUS appends a full status report", () => {
  const { state, a } = fresh();
  placeAdjacentBase(state, a);
  setArgs(a, "DOCK STATUS");
  reset(a);
  dock(state, a);
  const o = out(a);
  assert.match(o, /DOCKED\./);
  assert.match(o, /Loc/, "status report follows DOCKED.");
});
