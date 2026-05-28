/**
 * TRACTOR — engage/release a tractor beam; MOVE-tow integration.
 * Source-pinned DECWAR.FOR:4442–4519 (TRACTR/TRCOFF); MOVE-tow at 2233–2239; strings 349–357.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { tractor } from "../../src/commands/tractor.ts";
import { move } from "../../src/commands/move.ts";
import { shields } from "../../src/commands/shields.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import { SHIP_NAMES } from "../../src/render/strings.ts";
import { SHIELD, DX } from "../../src/core/constants.ts";
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

function placeFriend(state: GameState, session: Session, dv = 1, dh = 0): number {
  const ship = state.ships[session.who]!;
  const friendIdx = session.team === 1 ? 2 : 11;
  const friend = state.ships[friendIdx]!;
  friend.vPos = ship.vPos + dv;
  friend.hPos = ship.hPos + dh;
  friend.shieldCond = SHIELD.DOWN;
  state.alive[friendIdx] = -1;
  // Update board with friend's marker.
  state.board.setdsp(friend.vPos, friend.hPos, (session.team * 100) + friendIdx);
  return friendIdx;
}

test("TRACTOR <friend> engages, mutual trstat set, both notified (iwhat=13)", async () => {
  const { state, a } = fresh();
  const friendIdx = placeFriend(state, a);
  state.ships[a.who]!.shieldCond = SHIELD.DOWN;
  setArgs(a, `TRACTOR ${SHIP_NAMES[friendIdx]}`);
  reset(a);
  await tractor(state, a);
  assert.equal(state.trstat[a.who], friendIdx);
  assert.equal(state.trstat[friendIdx], a.who);
  // Both players have the engage notification queued.
  assert.equal(state.bus.hasHits(a.who), true);
  assert.equal(state.bus.hasHits(friendIdx), true);
});

test("TRACTOR OFF with an active beam clears both sides + iwhat=14", async () => {
  const { state, a } = fresh();
  const friendIdx = placeFriend(state, a);
  state.trstat[a.who] = friendIdx;
  state.trstat[friendIdx] = a.who;
  setArgs(a, "TRACTOR OFF");
  reset(a);
  await tractor(state, a);
  assert.equal(state.trstat[a.who], 0);
  assert.equal(state.trstat[friendIdx], 0);
  assert.equal(state.bus.hasHits(a.who), true);
  assert.equal(state.bus.hasHits(friendIdx), true);
});

test("TRACTOR OFF with no active beam → TRACT2", async () => {
  const { state, a } = fresh();
  setArgs(a, "TRACTOR OFF");
  reset(a);
  await tractor(state, a);
  assert.match(out(a), /Tractor beam not in operation/);
});

test("Bare TRACTOR with an active beam releases it (source 4449)", async () => {
  const { state, a } = fresh();
  const friendIdx = placeFriend(state, a);
  state.trstat[a.who] = friendIdx;
  state.trstat[friendIdx] = a.who;
  setArgs(a, "TRACTOR");
  reset(a);
  await tractor(state, a);
  assert.equal(state.trstat[a.who], 0);
  assert.equal(state.trstat[friendIdx], 0);
});

test("TRACTOR <self> → TRACT4", async () => {
  const { state, a } = fresh();
  state.ships[a.who]!.shieldCond = SHIELD.DOWN;
  setArgs(a, `TRACTOR ${SHIP_NAMES[a.who]}`);
  reset(a);
  await tractor(state, a);
  assert.match(out(a), /You want to apply a tractor/);
});

test("TRACTOR <enemy> → TRACT5", async () => {
  const { state, a } = fresh(); // a is Fed
  const enemyIdx = 11; // Emp slot 1
  const ship = state.ships[a.who]!;
  state.ships[enemyIdx]!.vPos = ship.vPos + 1;
  state.ships[enemyIdx]!.hPos = ship.hPos;
  state.ships[enemyIdx]!.shieldCond = SHIELD.DOWN;
  state.alive[enemyIdx] = -1;
  ship.shieldCond = SHIELD.DOWN;
  setArgs(a, `TRACTOR ${SHIP_NAMES[enemyIdx]}`);
  reset(a);
  await tractor(state, a);
  assert.match(out(a), /Can not apply tractor beam to enemy ship/);
});

test("TRACTOR <friend> with YOUR shields up → TRACT7", async () => {
  const { state, a } = fresh();
  const friendIdx = placeFriend(state, a);
  state.ships[a.who]!.shieldCond = SHIELD.UP;
  setArgs(a, `TRACTOR ${SHIP_NAMES[friendIdx]}`);
  reset(a);
  await tractor(state, a);
  assert.match(out(a), /tractor beam through shields/);
  assert.equal(state.trstat[a.who] ?? 0, 0);
});

test("TRACTOR <friend> with HIS shields up → TRACT8", async () => {
  const { state, a } = fresh();
  const friendIdx = placeFriend(state, a);
  state.ships[a.who]!.shieldCond = SHIELD.DOWN;
  state.ships[friendIdx]!.shieldCond = SHIELD.UP;
  setArgs(a, `TRACTOR ${SHIP_NAMES[friendIdx]}`);
  reset(a);
  await tractor(state, a);
  assert.match(out(a), /has his shields up/);
  assert.equal(state.trstat[a.who] ?? 0, 0);
});

test("TRACTOR <friend> when already towing → TRACT3", async () => {
  const { state, a } = fresh();
  const friendIdx = placeFriend(state, a);
  state.trstat[a.who] = friendIdx;
  state.trstat[friendIdx] = a.who;
  // Try to tractor someone else.
  setArgs(a, `TRACTOR ${SHIP_NAMES[friendIdx]}`); // any name; the trstat check fires first
  reset(a);
  await tractor(state, a);
  assert.match(out(a), /Tractor beam already active/);
});

test("SHIELDS UP cuts an active tractor beam via trcoff (iwhat=14 emitted)", async () => {
  const { state, a } = fresh();
  const friendIdx = placeFriend(state, a);
  state.trstat[a.who] = friendIdx;
  state.trstat[friendIdx] = a.who;
  state.ships[a.who]!.shieldCond = SHIELD.DOWN;
  setArgs(a, "SHIELDS UP");
  reset(a);
  await shields(state, a);
  assert.equal(state.trstat[a.who], 0);
  assert.equal(state.trstat[friendIdx], 0);
  assert.equal(state.bus.hasHits(friendIdx), true, "partner gets iwhat=14");
});

test("MOVE-tow: a tractoring ship drags the towed ship along + ×3 energy cost", async () => {
  const { state, a } = fresh(["", ""]); // unused — MOVE expects coord input
  const friendIdx = placeFriend(state, a, 1, 0); // friend one cell vertically away
  const ship = state.ships[a.who]!;
  const friend = state.ships[friendIdx]!;
  state.trstat[a.who] = friendIdx;
  state.trstat[friendIdx] = a.who;
  ship.shieldCond = SHIELD.DOWN;
  friend.shieldCond = SHIELD.DOWN;
  const v0 = ship.vPos, h0 = ship.hPos;
  const e0 = ship.energy;
  // Move 2 cells "up" (away from friend) — clear path.
  // Use ABS coordinates: target = (v0-2, h0).
  setArgs(a, `MOVE ${v0 - 2} ${h0}`);
  reset(a);
  const tc = await move(state, a, false);
  assert.equal(tc, true);
  // Ship moved.
  assert.equal(ship.vPos, v0 - 2);
  assert.equal(ship.hPos, h0);
  // Towed ship dragged to one cell behind the ship along the move direction.
  // Move direction iV = -2, iH = 0 → dominantV → disV = sign(iV) = -1, disH = 0.
  // Tow position = (v1 - disV, h1 - disH) = (v0-2 - (-1), h0 - 0) = (v0-1, h0).
  assert.equal(friend.vPos, v0 - 1);
  assert.equal(friend.hPos, h0);
  // Energy cost: 40 * ia² with ×3 tow = 40 * 4 * 3 = 480.
  assert.equal(ship.energy, e0 - 480);
  // Board: ship at new cell, friend at trailing cell.
  assert.equal(state.board.disp(ship.vPos, ship.hPos), (a.team * 100) + a.who);
  assert.equal(state.board.disp(friend.vPos, friend.hPos), (a.team * 100) + friendIdx);
  // Old cells cleared (board.disp returns DX.MPTY*100 = 0 for empty, see board.ts).
  assert.equal(state.board.disp(v0, h0), DX.MPTY * 100);
});
