/**
 * Tests for PWR and PHADAM (phaser damage). Pinned to DECWAR.FOR:4099–4234 and WARMAC.MAC:2728.
 * Golden values captured from this implementation; the shield-absorption / penetration / kill
 * behavior is hand-reasoned. (Small integer seeds make the LCG's first draw tiny, so combat
 * tests warm the RNG where a non-trivial `rana` is needed — real clock seeds are uniform.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState, newlyActivatedShip } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { phadam } from "../../src/combat/damage.ts";
import { pwr } from "../../src/combat/pwr.ts";
import { Rng } from "../../src/core/rng.ts";
import { PT, DEV, COND, KENDAM } from "../../src/core/constants.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import type { GameState } from "../../src/core/state.ts";

test("pwr matches exponentiation-by-squaring", () => {
  assert.equal(pwr(0.9, 0), 1);
  assert.equal(pwr(0.9, 1), 0.9);
  assert.ok(Math.abs(pwr(0.9, 4) - 0.6561) < 1e-9);
  assert.ok(Math.abs(pwr(0.91, 10) - 0.91 ** 10) < 1e-6); // squaring path ≈ naive within tolerance
});

/** Fed ship #1 at (10,10) fires at an Empire ship #10 at (10,13), id=3, phit=200. */
function fireAt(seed: number, victimShields: number, victimDamage = 0, warmup = 0) {
  const state: GameState = createInitialGameState(new Rng(seed));
  for (let i = 0; i < warmup; i++) state.rng.ran();
  const session = createSession(new ScriptedIo([]));
  session.who = 1;
  session.team = 1;
  session.player = true;
  state.ships[1] = newlyActivatedShip();
  state.ships[1]!.vPos = 10;
  state.ships[1]!.hPos = 10;
  state.alive[1] = -1;
  const vic = newlyActivatedShip();
  vic.vPos = 10;
  vic.hPos = 13;
  vic.shieldPct = victimShields;
  if (victimShields <= 0) vic.shieldCond = -1;
  vic.damage = victimDamage;
  state.ships[10] = vic;
  state.alive[10] = -1;
  state.board.setdsp(10, 13, 210);
  const firer = { ship: true, player: true, who: 1, team: 1 as const, tpoint: session.tpoint };
  const result = phadam(state, firer, 2, 10, 3, 200);
  return { state, session, result, vic };
}

test("full shields absorb the hit (nothing penetrates) but shields drain", () => {
  const { result, vic } = fireAt(1, 1000);
  assert.equal(result.ihita, 0);
  assert.equal(vic.damage, 0);
  assert.equal(vic.shieldPct, 813); // drained
  assert.equal(vic.condition, COND.RED); // hittee goes red
});

test("shields-down hit penetrates fully and scores enemy damage", () => {
  const { result, vic, session } = fireAt(1, 0);
  assert.equal(result.ihita, 12436);
  assert.equal(vic.damage, 12436);
  assert.equal(vic.energy, 37563); // 50000 - 12436
  assert.equal(session.tpoint[PT.KPEDAM], 12436);
});

test("half shields partially absorb", () => {
  const { vic } = fireAt(1, 500);
  assert.equal(vic.damage, 3109);
  assert.equal(vic.shieldPct, 406);
});

test("a strong penetrating hit criticals a random device", () => {
  const { result, state } = fireAt(1, 0, 0, 1); // warm RNG so rana is large
  assert.equal(result.critdv, DEV.KDTORP); // device 5
  assert.equal(state.devices[10]![DEV.KDTORP], 6046);
});

test("a hit that crosses KENDAM kills the ship and clears its board cell", () => {
  const { result, state } = fireAt(1, 0, 20000); // 20000 + 12436 ≥ 25000
  assert.equal(result.klflg, 2);
  assert.equal(state.alive[10], 0);
  assert.ok(state.ships[10]!.damage >= KENDAM);
  assert.equal(state.board.disp(10, 13), 0); // dead ship removed
});
