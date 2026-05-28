/**
 * Tests for PHACON (the PHASERS command), PRIDIS routing, and OUTHIT rendering. Pinned to
 * DECWAR.FOR:2635–2749, 3042–3057, and the comms/OUTHIT model (Deliverable #9).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState, newlyActivatedShip } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { phasers } from "../../src/commands/phasers.ts";
import { pridis } from "../../src/comms/messageBus.ts";
import { renderHit } from "../../src/comms/outhit.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { KRANGE } from "../../src/core/constants.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import type { GameState } from "../../src/core/state.ts";
import type { Session } from "../../src/core/session.ts";

function setup(seed = 1): { state: GameState; session: Session; io: ScriptedIo } {
  const state = createInitialGameState(new Rng(seed));
  const io = new ScriptedIo([]);
  const session = createSession(io);
  session.who = 1;
  session.team = 1;
  session.player = true;
  state.ships[1] = newlyActivatedShip();
  state.ships[1]!.vPos = 10;
  state.ships[1]!.hPos = 10;
  state.alive[1] = -1;
  state.numply = 1;
  state.numsid[1] = 1;
  state.board.setdsp(10, 10, 101);
  return { state, session, io };
}

function addShip(state: GameState, slot: number, team: 1 | 2, v: number, h: number): void {
  const s = newlyActivatedShip();
  s.vPos = v;
  s.hPos = h;
  state.ships[slot] = s;
  state.alive[slot] = -1;
  state.board.setdsp(v, h, team * 100 + slot);
}

async function fire(cmd: string, seed = 1) {
  const { state, session, io } = setup(seed);
  // an Empire target at (10,13)
  addShip(state, 10, 2, 10, 13);
  session.tokens = tokenize(cmd, 0).tokens;
  const tc = await phasers(state, session);
  return { state, session, io, tc };
}

test("firing at an enemy in range damages it and queues a hit for the firer", async () => {
  const { state, session, io, tc } = await fire("PHASERS 10 13");
  assert.equal(tc, true);
  assert.ok(state.ships[1]!.energy < 50000); // paid energy (2000 shields + phit*10)
  assert.equal(state.ships[1]!.condition, 3); // firer goes RED
  assert.ok(state.bus.hasHits(1)); // firer sees the hit
  assert.ok(state.bus.hasHits(10)); // victim sees it too
  assert.match(io.output, /High speed shield control activated\./);
});

test("the firer's hit renders as a phaser-hit line with ship names (LONG)", async () => {
  const { state, session, io } = await fire("PHASERS 10 13");
  session.oflg = 1; // LONG — exercises the verbose verb (outh06 "phaser hit on ")
  io.output = "";
  for (const e of state.bus.drainHits(1)) renderHit(state, session, e);
  // Source 2466: hittee may wrap to next line when hcpos > 40 in LONG mode.
  assert.match(io.output, /Excalibur[\s\S]*makes[\s\S]*phaser hit on[\s\S]*Buzzard/);
});

test("the firer's hit renders with the MEDIUM 'P' verb by default", async () => {
  const { state, session, io } = await fire("PHASERS 10 13");
  io.output = "";
  for (const e of state.bus.drainHits(1)) renderHit(state, session, e);
  // MEDIUM verbosity: ihita + ' unit ' + 'P' + Buzzard (no 'phaser hit on ' verb)
  assert.match(io.output, /Excalibur .* unit PBuzzard/);
  assert.doesNotMatch(io.output, /phaser hit on/);
});

test("firing on a friendly ship is refused", async () => {
  const { state, session, io } = setup();
  addShip(state, 2, 1, 10, 13); // a friendly (Fed) ship
  session.tokens = tokenize("PHASERS 10 13", 0).tokens;
  const tc = await phasers(state, session);
  assert.equal(tc, false);
  assert.match(io.output, /Attempting to hit friendly object/);
});

test("an out-of-range target is refused", async () => {
  const { state, session, io } = setup();
  addShip(state, 10, 2, 10, 30); // 20 sectors away (> KRANGE 10)
  session.tokens = tokenize("PHASERS 10 30", 0).tokens;
  const tc = await phasers(state, session);
  assert.equal(tc, false);
  assert.match(io.output, /Target out of range\./);
});

test("firing at empty space reports no target", async () => {
  const { state, session, io } = setup();
  session.tokens = tokenize("PHASERS 20 20", 0).tokens; // nothing there
  const tc = await phasers(state, session);
  assert.equal(tc, false);
  assert.match(io.output, /unable to lock on target/);
});

test("PRIDIS is a Chebyshev box over playing ships, with side filter", () => {
  const { state } = setup();
  addShip(state, 10, 2, 50, 40); // exactly 10 away in V
  addShip(state, 11, 2, 51, 40); // 11 away — out
  addShip(state, 2, 1, 50, 40); // a Fed ship at the same cell
  const empInRange = pridis(state, 40, 40, KRANGE, 2); // Empire only
  assert.equal((empInRange & (1 << (10 - 1))) !== 0, true); // ship 10 included
  assert.equal((empInRange & (1 << (11 - 1))) !== 0, false); // ship 11 excluded (|dV|=11)
  assert.equal((empInRange & (1 << (2 - 1))) !== 0, false); // Fed ship 2 excluded by side filter
});
