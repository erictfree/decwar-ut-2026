/**
 * ENERGY — friendly ship-to-ship energy transfer with 10% loss.
 * Source-pinned DECWAR.FOR:1001–1067; strings MSG.MAC:67–76, 152.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { energy } from "../../src/commands/energy.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import { SHIP_NAMES } from "../../src/render/strings.ts";
import type { GameState } from "../../src/core/state.ts";
import type { Session } from "../../src/core/session.ts";

function fresh(scripted: string[] = []): { state: GameState; a: Session } {
  const state = createInitialGameState(new Rng(1));
  const a = createSession(new ScriptedIo(scripted));
  activate(state, a);
  return { state, a };
}
const out = (s: Session): string => (s.io as ScriptedIo).output;
const reset = (s: Session): void => { (s.io as ScriptedIo).output = ""; };
const setArgs = (s: Session, line: string): void => {
  s.tokens = tokenize(line, 0).tokens;
};

/** Place a second Fed ship (slot 2 = "Buzzard"? actually let me check) adjacent to player. */
function placeAdjacentFriend(state: GameState, session: Session): number {
  const ship = state.ships[session.who]!;
  // Pick a slot on the same team. Player is Fed (slot 1–9). Use slot 2.
  const friendIdx = session.team === 1 ? 2 : 11;
  const friend = state.ships[friendIdx]!;
  friend.vPos = ship.vPos + 1;
  friend.hPos = ship.hPos;
  friend.energy = 0;
  friend.shieldCond = -1;
  friend.shieldPct = 0;
  state.alive[friendIdx] = -1; // playing
  return friendIdx;
}

test("ENERGY <friend> <amount> transfers with 10% loss; recipient gets makeHit iwhat=12", async () => {
  const { state, a } = fresh();
  const friendIdx = placeAdjacentFriend(state, a);
  const ship = state.ships[a.who]!;
  const friend = state.ships[friendIdx]!;
  ship.energy = 10000; // 1000 raw

  // 100 raw → 1000 ×10. ihita = min(int(1000*0.9), 50000-0) = 900.
  // source.energy -= 900 + 100 = 1000. target.energy += 900.
  setArgs(a, `ENERGY ${SHIP_NAMES[friendIdx]} 100`);
  reset(a);
  await energy(state, a);
  assert.equal(ship.energy, 10000 - 1000);
  assert.equal(friend.energy, 900);
  assert.match(out(a), /Energy transferred/);
  // Recipient queue should have the iwhat=12 event.
  assert.equal(state.bus.hasHits(friendIdx), true);
});

test("ENERGY to non-adjacent friend → ENERG3 (Not adjacent)", async () => {
  const { state, a } = fresh();
  const friendIdx = a.team === 1 ? 2 : 11;
  state.alive[friendIdx] = -1;
  const ship = state.ships[a.who]!;
  state.ships[friendIdx]!.vPos = ship.vPos + 5; // far
  state.ships[friendIdx]!.hPos = ship.hPos + 5;
  setArgs(a, `ENERGY ${SHIP_NAMES[friendIdx]} 100`);
  reset(a);
  await energy(state, a);
  assert.match(out(a), /Not adjacent/);
});

test("ENERGY to an enemy ship → ENERG2", async () => {
  const { state, a } = fresh(); // a is Fed
  const enemyIdx = 11; // first Emp slot
  const ship = state.ships[a.who]!;
  state.ships[enemyIdx]!.vPos = ship.vPos + 1;
  state.ships[enemyIdx]!.hPos = ship.hPos;
  state.alive[enemyIdx] = -1;
  setArgs(a, `ENERGY ${SHIP_NAMES[enemyIdx]} 100`);
  reset(a);
  await energy(state, a);
  assert.match(out(a), /Can not transfer energy to enemy ship/);
});

test("ENERGY to self → ENERG7", async () => {
  const { state, a } = fresh();
  setArgs(a, `ENERGY ${SHIP_NAMES[a.who]} 100`);
  reset(a);
  await energy(state, a);
  assert.match(out(a), /Transfer energy to US/);
});

test("ENERGY <friend> <too-much> → ENER4S/L (insufficient)", async () => {
  const { state, a } = fresh();
  placeAdjacentFriend(state, a);
  state.ships[a.who]!.energy = 100; // tiny
  const friendIdx = a.team === 1 ? 2 : 11;
  setArgs(a, `ENERGY ${SHIP_NAMES[friendIdx]} 100`); // 100 raw = 1000 ×10 ≥ 100
  reset(a);
  await energy(state, a);
  assert.match(out(a), /Insufficient ship energy|doesn't possess that much energy/);
});

test("ENERGY <friend> 0 or negative → ENERG5 (Transfer aborted)", async () => {
  const { state, a } = fresh();
  placeAdjacentFriend(state, a);
  const friendIdx = a.team === 1 ? 2 : 11;
  setArgs(a, `ENERGY ${SHIP_NAMES[friendIdx]} 0`);
  reset(a);
  await energy(state, a);
  assert.match(out(a), /Transfer aborted/);
});

test("ENERGY <unknown> → UNKSHP", async () => {
  const { state, a } = fresh();
  setArgs(a, "ENERGY Glorp 100");
  reset(a);
  await energy(state, a);
  assert.match(out(a), /Unknown ship name/);
});

test("ENERGY <slot> on a not-playing ship → NOSHIP", async () => {
  const { state, a } = fresh();
  const friendIdx = a.team === 1 ? 2 : 11;
  state.alive[friendIdx] = 1; // available (not playing)
  setArgs(a, `ENERGY ${SHIP_NAMES[friendIdx]} 100`);
  reset(a);
  await energy(state, a);
  assert.match(out(a), /Player not in game/);
});
