/**
 * Tests for the per-turn world processing (postMove). Pinned to DECWAR.FOR:222–254.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState, newlyActivatedShip } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { postMove } from "../../src/runtime/scheduler.ts";
import { Rng } from "../../src/core/rng.ts";
import { KCRIT, KENDAM, DEV, TEAM, DX } from "../../src/core/constants.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";

function setup(seed: number) {
  const state = createInitialGameState(new Rng(seed));
  const session = createSession(new ScriptedIo([]));
  activate(state, session); // who=1 (Fed), universe built, numply=1, numsid[1]=1
  return { state, session };
}

test("end-of-turn repair reduces every device by 300", () => {
  const { state, session } = setup(3);
  state.numply = 2; // dotime 0→1 < 2: no world-tick (isolate repair from base/planet fire)
  state.devices[1]![DEV.KDPHAS] = 1000;
  postMove(state, session);
  assert.equal(state.devices[1]![DEV.KDPHAS], 700); // 1000 - 300
});

test("the stardate/turn counter advances each turn", () => {
  const { state, session } = setup(4);
  assert.equal(state.ships[1]!.turns, 0);
  postMove(state, session);
  assert.equal(state.ships[1]!.turns, 1);
  assert.equal(state.tmturn[TEAM.FED], 1);
});

test("the world tick rebuilds a weakened enemy base when dotime reaches numply", () => {
  const { state, session } = setup(5); // numply=1 → tick every move
  state.bases[TEAM.EMP]![1]!.strength = 500;
  postMove(state, session); // dotime 0→1 ≥ numply(1) → tick → basbld
  assert.equal(state.bases[TEAM.EMP]![1]!.strength, 525); // +25/numsid(1)
});

test("the world tick does NOT fire until dotime reaches numply", () => {
  const { state, session } = setup(6);
  state.numply = 3; // pretend a 3-player game
  state.numsid[TEAM.FED] = 3;
  state.dotime = 0;
  state.bases[TEAM.EMP]![1]!.strength = 500;

  postMove(state, session); // dotime 1 < 3 → no tick
  assert.equal(state.bases[TEAM.EMP]![1]!.strength, 500);
  postMove(state, session); // dotime 2 < 3 → no tick
  assert.equal(state.bases[TEAM.EMP]![1]!.strength, 500);
  postMove(state, session); // dotime 3 ≥ 3 → tick
  assert.equal(state.dotime, 0);
  assert.ok(state.bases[TEAM.EMP]![1]!.strength > 500);
});

/** A Fed player ship (shields down) on an otherwise-empty board, ready to be shot at. */
function lonePlayer(seed: number) {
  const state = createInitialGameState(new Rng(seed));
  const session = createSession(new ScriptedIo([]));
  session.who = 1;
  session.team = 1;
  session.player = true;
  state.ships[1] = newlyActivatedShip();
  state.ships[1]!.vPos = 10;
  state.ships[1]!.hPos = 10;
  state.ships[1]!.shieldPct = 0;
  state.ships[1]!.shieldCond = -1;
  state.alive[1] = -1;
  state.numply = 1;
  state.numsid[1] = 1;
  state.board.setdsp(10, 10, 101);
  return { state, session };
}

test("baspha: an enemy base in range fires at the player ship", () => {
  const { state, session } = lonePlayer(2);
  state.nbase[TEAM.EMP] = 1;
  state.bases[TEAM.EMP]![1]!.strength = 1000;
  state.bases[TEAM.EMP]![1]!.vPos = 12;
  state.bases[TEAM.EMP]![1]!.hPos = 12; // Chebyshev 2 from the ship (≤ 4)
  state.board.setdsp(12, 12, 401);

  postMove(state, session, false); // world-tick fires (numply=1)
  assert.ok(state.ships[1]!.damage > 0, "base should have damaged the ship");
  assert.ok(state.bus.hasHits(1), "the ship should receive a hit message");
});

test("plnatk: an enemy planet in range fires at the player ship", () => {
  const { state, session } = lonePlayer(2);
  state.nplnet = 1;
  state.planets[1]!.vPos = 11;
  state.planets[1]!.hPos = 11; // Chebyshev 1 from the ship (≤ 2)
  state.planets[1]!.buildCount = 2;
  state.board.setdsp(11, 11, DX.EPLN * 100 + 1); // Empire planet

  postMove(state, session, false);
  assert.ok(state.ships[1]!.damage > 0, "planet should have damaged the ship");
  assert.ok(state.bus.hasHits(1));
});

test("life support: a critically-damaged, undocked ship loses a stardate and dies at empty", () => {
  const { state, session } = setup(7);
  // Must stay ≥ KCRIT AFTER the end-of-turn repair (which heals 300 off every device first).
  state.devices[1]![DEV.KDLIFE] = KCRIT + 300;
  state.docked[1] = 0; // not docked
  state.ships[1]!.lifeSupport = 0;
  postMove(state, session);
  assert.equal(state.devices[1]![DEV.KDLIFE], KCRIT); // repaired down to exactly KCRIT
  assert.equal(state.ships[1]!.lifeSupport, -1); // decayed
  assert.equal(state.ships[1]!.damage, KENDAM); // fatal
});
