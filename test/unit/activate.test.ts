/**
 * Tests for player activation + FREE. Pinned to SETUP.FOR:194–467 and FREE (DECWAR.FOR:1076).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate, freeShip } from "../../src/lifecycle/activate.ts";
import { Rng } from "../../src/core/rng.ts";
import { KNPLAY, ENERGY_CAP, SHIELD_CAP, COND, TEAM } from "../../src/core/constants.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import type { GameState } from "../../src/core/state.ts";

function newSession(state: GameState) {
  return createSession(new ScriptedIo([]));
}

test("first player builds the universe and gets a Federation ship", () => {
  const state = createInitialGameState(new Rng(5));
  const s = newSession(state);
  const r = activate(state, s);

  assert.equal(r.ok, true);
  assert.equal(r.who, 1); // first free Fed slot
  assert.equal(r.team, TEAM.FED);
  assert.equal(state.built, true);
  assert.equal(state.numply, 1);
  assert.equal(state.numsid[1], 1);
  assert.equal(state.alive[1], -1); // playing

  const ship = state.ships[1]!;
  assert.equal(ship.energy, ENERGY_CAP);
  assert.equal(ship.shieldPct, SHIELD_CAP);
  assert.equal(ship.torps, 10);
  assert.equal(ship.condition, COND.GREEN);
  assert.ok(ship.vPos >= 1 && ship.vPos <= 75 && ship.hPos >= 1 && ship.hPos <= 75);
  assert.equal(state.board.dispx(ship.vPos, ship.hPos), 1); // ship #1 on the board
});

test("sides stay balanced: second player joins the Empire", () => {
  const state = createInitialGameState(new Rng(6));
  activate(state, newSession(state)); // Fed #1
  const r2 = activate(state, newSession(state));
  assert.equal(r2.team, TEAM.EMP);
  assert.ok(r2.who >= 10 && r2.who <= 18);
});

test("the game fills at 18 ships; the 19th is refused", () => {
  const state = createInitialGameState(new Rng(7));
  for (let i = 0; i < KNPLAY; i++) {
    assert.equal(activate(state, newSession(state)).ok, true, `activation ${i + 1}`);
  }
  assert.equal(state.numply, KNPLAY);
  const overflow = activate(state, newSession(state));
  assert.equal(overflow.ok, false);
  assert.equal(overflow.full, true);
  assert.equal(state.numply, KNPLAY); // unchanged
});

test("FREE recycles the slot and clears the board cell", () => {
  const state = createInitialGameState(new Rng(8));
  const s = newSession(state);
  activate(state, s);
  const who = s.who;
  const ship = state.ships[who]!;
  const { vPos, hPos } = ship;
  assert.equal(state.board.disp(vPos, hPos) !== 0, true);

  freeShip(state, s);
  assert.equal(state.alive[who], 1); // available again
  assert.equal(state.numply, 0);
  assert.equal(state.board.disp(vPos, hPos), 0); // cell cleared
  assert.equal(s.who, 0);
  assert.ok(state.hitime > 0); // 5-minute grace armed when the last player left
});
