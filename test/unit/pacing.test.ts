// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Pacing — weapon cooldowns + ptime between-prompt pauses.
 * Source: phbank/tobank gating (PHACON 2668, TORP 4415), ptime in DOCK/REPAIR/BUILD/CAPTURE/MOVE.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { phasers } from "../../src/commands/phasers.ts";
import { torpedos } from "../../src/commands/torpedos.ts";
import { dock } from "../../src/commands/dock.ts";
import { repairCmd } from "../../src/commands/repair.ts";
import { build } from "../../src/commands/build.ts";
import { move } from "../../src/commands/move.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { FakeClock } from "../../src/runtime/clock.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import { DX, COND, DEV, KNTORP_MAX } from "../../src/core/constants.ts";
import type { GameState } from "../../src/core/state.ts";
import type { Session } from "../../src/core/session.ts";

function fresh(): { state: GameState; a: Session; clock: FakeClock } {
  const clock = new FakeClock(0, 0);
  const state = createInitialGameState(new Rng(1), clock);
  const a = createSession(new ScriptedIo([]));
  activate(state, a);
  return { state, a, clock };
}
const setArgs = (s: Session, line: string): void => {
  s.tokens = tokenize(line, 0).tokens;
};

/** Plant an enemy ship adjacent to the player's ship so phasers can fire. */
function placeEnemy(state: GameState, session: Session): number {
  const ship = state.ships[session.who]!;
  const enemyIdx = session.team === 1 ? 11 : 2;
  state.alive[enemyIdx] = -1;
  state.ships[enemyIdx]!.vPos = ship.vPos + 1;
  state.ships[enemyIdx]!.hPos = ship.hPos;
  state.ships[enemyIdx]!.shieldCond = -1;
  state.ships[enemyIdx]!.energy = 50000;
  state.ships[enemyIdx]!.damage = 0;
  state.board.setdsp(ship.vPos + 1, ship.hPos, (session.team === 1 ? DX.ESHP : DX.FSHP) * 100 + enemyIdx);
  return enemyIdx;
}

// ── PHASER bank cooldown ────────────────────────────────────────────────────────────────────

test("PHASER stamps phbank to clock.monotonic + delta after firing", async () => {
  const { state, a, clock } = fresh();
  placeEnemy(state, a);
  const ship = state.ships[a.who]!;
  setArgs(a, `PHASERS 200 ${ship.vPos + 1} ${ship.hPos}`);
  clock.advance(5000); // 5s into game
  await phasers(state, a);
  // phbank[bank] = monotonic + (slwest+1)*1500 + dev[KDPHAS]
  // = 5000 + (1+1)*1500 + 0 = 8000
  const bank = (a.phbank[1] ?? 0) > 0 ? 1 : 2;
  assert.ok((a.phbank[bank] ?? 0) >= 8000, `phbank should be ≥ 8000, got ${a.phbank[bank]}`);
});

test("A second PHASER while the bank is still cooling triggers io.pause", async () => {
  const { state, a, clock } = fresh();
  placeEnemy(state, a);
  const ship = state.ships[a.who]!;
  // Pre-stamp both banks 5 seconds into the future.
  a.phbank[1] = 5000;
  a.phbank[2] = 5000;
  setArgs(a, `PHASERS 200 ${ship.vPos + 1} ${ship.hPos}`);
  const io = a.io as ScriptedIo;
  const before = io.pausedMs;
  await phasers(state, a);
  assert.ok(io.pausedMs > before, `expected a pause; pausedMs went ${before} → ${io.pausedMs}`);
  // The pause should be ≈ ready - now = 5000 - 0.
  assert.ok(io.pausedMs - before >= 5000, "the pause should equal the cooldown remainder");
  void clock;
});

test("PHASER does not pause when the bank is already ready", async () => {
  const { state, a, clock } = fresh();
  placeEnemy(state, a);
  const ship = state.ships[a.who]!;
  // Banks left at 0 → ready.
  setArgs(a, `PHASERS 200 ${ship.vPos + 1} ${ship.hPos}`);
  const io = a.io as ScriptedIo;
  const before = io.pausedMs;
  await phasers(state, a);
  assert.equal(io.pausedMs, before, "no pause expected when banks are ready");
  void clock;
});

// ── TORPEDO bank cooldown ───────────────────────────────────────────────────────────────────

test("TORPEDO stamps session.tobank after firing", async () => {
  const { state, a, clock } = fresh();
  placeEnemy(state, a);
  const ship = state.ships[a.who]!;
  ship.torps = KNTORP_MAX;
  setArgs(a, `TORPEDOS 1 ${ship.vPos + 1} ${ship.hPos}`);
  clock.advance(3000);
  await torpedos(state, a);
  // tobank = monotonic + ntorp * (slwest+1) * 1000 = 3000 + 1*2*1000 = 5000
  assert.ok(a.tobank >= 5000, `tobank should be ≥ 5000, got ${a.tobank}`);
});

test("A second TORPEDO burst while the tube is cooling triggers io.pause", async () => {
  const { state, a, clock } = fresh();
  placeEnemy(state, a);
  const ship = state.ships[a.who]!;
  ship.torps = KNTORP_MAX;
  a.tobank = 4000; // 4s in the future
  setArgs(a, `TORPEDOS 1 ${ship.vPos + 1} ${ship.hPos}`);
  const io = a.io as ScriptedIo;
  const before = io.pausedMs;
  await torpedos(state, a);
  assert.ok(io.pausedMs > before, `expected a pause; pausedMs went ${before} → ${io.pausedMs}`);
  void clock;
});

// ── ptime pacing ─────────────────────────────────────────────────────────────────────────────

function placeAdjacentBase(state: GameState, session: Session): void {
  const ship = state.ships[session.who]!;
  const b = state.bases[session.team]![1]!;
  b.vPos = ship.vPos + 1;
  b.hPos = ship.hPos;
  b.strength = 1000;
}

test("DOCK stamps session.ptime to slwest*1000 + 1000", () => {
  const { state, a } = fresh();
  placeAdjacentBase(state, a);
  setArgs(a, "DOCK");
  const before = a.ptime;
  dock(state, a);
  assert.equal(a.ptime - before, state.slwest * 1000 + 1000);
});

test("MOVE stamps session.ptime to slwest*1000 + 1000", async () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  setArgs(a, `MOVE ${ship.vPos + 1} ${ship.hPos}`);
  // Clear the destination so MOVE can succeed.
  state.board.setdsp(ship.vPos + 1, ship.hPos, 0);
  const before = a.ptime;
  await move(state, a, false);
  assert.equal(a.ptime - before, state.slwest * 1000 + 1000);
});

test("REPAIR stamps session.ptime per (repsiz*8)/mode formula", () => {
  const { state, a } = fresh();
  state.devices[a.who]![DEV.KDSHLD] = 1200; // damaged shields → mode 1 will repair 500
  setArgs(a, "REPAIR");
  const before = a.ptime;
  repairCmd(state, a);
  // Undocked → mode 1, repsiz 500. ptime += (500*8)/1 = 4000.
  assert.equal(a.ptime - before, 4000);
  void COND;
});

test("BUILD on a stage-1 planet stamps session.ptime to slwest*1000 + 4000", async () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  const v = ship.vPos + 1, h = ship.hPos;
  state.nplnet++;
  const slot = state.nplnet;
  state.planets[slot] = { vPos: v, hPos: h, buildCount: 0, scanMask: 0 };
  state.board.setdsp(v, h, (DX.NPLN + a.team) * 100 + slot);
  state.numcap[a.team] = (state.numcap[a.team] ?? 0) + 1;
  setArgs(a, `BUILD ${v} ${h}`);
  const before = a.ptime;
  await build(state, a);
  assert.equal(a.ptime - before, state.slwest * 1000 + 4000);
});
