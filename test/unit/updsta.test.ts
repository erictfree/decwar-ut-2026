// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Tests for UPDSTA — honor-roll write on `freeShip` (F-3-4). Pinned to WARMAC.MAC:5556
 * (updsta) and DECWAR.FOR:1076–1107 (FREE). Verifies that:
 *   • A dying player gets `alive=false` in the persisted roll.
 *   • A quitting (still-alive) player gets `alive=true`.
 *   • Score = sum across KNPOIN categories, truncated ÷ 10 (Tenths → integer).
 *   • Captain name from session.captain is persisted with the entry.
 *   • Returning identity restores the captain name into a fresh session.
 *   • Zero-score, no-name entries are dropped (nothing worth recording).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate, freeShip, playerTotalPoints } from "../../src/lifecycle/activate.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import { TEAM, KNPOIN } from "../../src/core/constants.ts";
import type { GameState } from "../../src/core/state.ts";
import type { Session } from "../../src/core/session.ts";

function fresh(identity = "user-1") {
  const state = createInitialGameState(new Rng(11));
  const io = new ScriptedIo([]);
  const session = createSession(io);
  session.identity = identity;
  activate(state, session);
  return { state, session };
}

/** Set per-category Tenths scores so the player's total truncated points is `pts`. */
function setScore(state: GameState, who: number, pts: number) {
  // Spread into category 1 as ×10 (Tenths). playerTotalPoints divides by 10 and truncates.
  if (state.score[1]) state.score[1][who] = pts * 10;
}

test("playerTotalPoints sums the KNPOIN categories and truncates ×10 → integer", () => {
  const { state } = fresh();
  for (let i = 1; i <= KNPOIN; i++) {
    const row = state.score[i];
    if (row) row[1] = (i * 100) * 10; // ×10 scaled
  }
  // Categories 1..8 sum: 100+200+...+800 = 3600
  assert.equal(playerTotalPoints(state, 1), 3600);
});

test("freeShip writes a fallen-captain entry when dead=true", () => {
  const { state, session } = fresh("died-1");
  session.captain = "KIRK";
  setScore(state, session.who, 1250);
  freeShip(state, session, true); // dead=true
  const roll = state.honor.load();
  // First player was Federation (Excalibur, slot 1).
  assert.equal(roll.fed.length, 1);
  assert.equal(roll.fed[0]!.alive, false);
  assert.equal(roll.fed[0]!.captain, "KIRK");
  assert.equal(roll.fed[0]!.score, 1250);
  assert.equal(roll.fed[0]!.ship, 1);
  assert.equal(roll.fed[0]!.identity, "died-1");
});

test("freeShip writes a high-roller entry when dead=false (quit while alive)", () => {
  const { state, session } = fresh("quit-1");
  session.captain = "PICARD";
  setScore(state, session.who, 800);
  freeShip(state, session, false);
  const roll = state.honor.load();
  assert.equal(roll.fed[0]!.alive, true);
  assert.equal(roll.fed[0]!.captain, "PICARD");
});

test("freeShip omits entries with zero score AND no captain name", () => {
  const { state, session } = fresh("ghost");
  // captain "" and no score set → nothing to record.
  freeShip(state, session, true);
  const roll = state.honor.load();
  assert.equal(roll.fed.length, 0);
});

test("freeShip records an entry when captain is set even if score is zero", () => {
  const { state, session } = fresh("named-but-zero");
  session.captain = "NEWBIE";
  freeShip(state, session, true);
  const roll = state.honor.load();
  assert.equal(roll.fed.length, 1);
  assert.equal(roll.fed[0]!.captain, "NEWBIE");
  assert.equal(roll.fed[0]!.score, 0);
});

test("activate restores the captain name for a returning identity", () => {
  const state = createInitialGameState(new Rng(11));
  // First life: set name and die.
  const io1 = new ScriptedIo([]);
  const a = createSession(io1);
  a.identity = "returning";
  activate(state, a);
  a.captain = "WORF";
  freeShip(state, a, true);
  // Fresh session for the same identity → activate should restore captain.
  const io2 = new ScriptedIo([]);
  const b = createSession(io2);
  b.identity = "returning";
  activate(state, b);
  assert.equal(b.captain, "WORF");
});

test("a session that explicitly SET NAME overrides the restored value", () => {
  const state = createInitialGameState(new Rng(11));
  const io1 = new ScriptedIo([]);
  const a = createSession(io1);
  a.identity = "switcher";
  activate(state, a);
  a.captain = "OLD";
  freeShip(state, a, true);

  const io2 = new ScriptedIo([]);
  const b = createSession(io2);
  b.identity = "switcher";
  b.captain = "NEW"; // explicit before activate → restore is skipped
  activate(state, b);
  assert.equal(b.captain, "NEW");
});

test("upsert + sort by score keeps the highest scorer first", () => {
  const state = createInitialGameState(new Rng(11));
  // Three Fed players activate and die with increasing scores.
  for (const [identity, captain, score] of [
    ["a", "ALPHA", 100],
    ["b", "BRAVO", 500],
    ["c", "CHARLIE", 300],
  ] as const) {
    const io = new ScriptedIo([]);
    const s = createSession(io);
    s.identity = identity as string;
    activate(state, s);
    s.captain = captain as string;
    setScore(state, s.who, score as number);
    freeShip(state, s, true);
  }
  const roll = state.honor.load();
  assert.deepEqual(
    roll.fed.map((e) => [e.captain, e.score]),
    [["BRAVO", 500], ["CHARLIE", 300], ["ALPHA", 100]],
  );
});

test("Empire player's entry is recorded on the Empire side", () => {
  const state = createInitialGameState(new Rng(11));
  const io = new ScriptedIo([]);
  const b = createSession(io);
  b.identity = "klingon";
  activate(state, b, { team: TEAM.EMP }); // pin to Empire
  b.captain = "KOR";
  setScore(state, b.who, 700);
  freeShip(state, b, true);
  const roll = state.honor.load();
  assert.equal(roll.emp.length, 1);
  assert.equal(roll.emp[0]!.captain, "KOR");
  assert.equal(roll.fed.length, 0);
});
