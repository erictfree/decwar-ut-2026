// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Tests for `*Zap` (F-3-5). Pinned to WARMAC.MAC:6156–6193 (stazap) and
 * SETUP.FOR:168 (`if (pasflg) call stazap`). *Zap is pre-game only and privileged:
 * silent no-op when pasflg=false; clears the honor-roll store when pasflg=true.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { runLobby } from "../../src/lifecycle/lobby.ts";
import { zap } from "../../src/commands/zap.ts";
import { TEAM } from "../../src/core/constants.ts";
import { upsertEntry, type HonorEntry } from "../../src/persistence/honorRoll.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";

function entry(over: Partial<HonorEntry> = {}): HonorEntry {
  return {
    identity: over.identity ?? "i",
    captain: over.captain ?? "KIRK",
    ship: over.ship ?? 1,
    score: over.score ?? 100,
    alive: over.alive ?? false,
    recordedAt: over.recordedAt ?? 0,
  };
}

function seedRoll() {
  const state = createInitialGameState(new Rng(11));
  const roll = state.honor.load();
  upsertEntry(roll, TEAM.FED, entry());
  upsertEntry(roll, TEAM.EMP, entry({ identity: "k", captain: "KOR", ship: 10 }));
  state.honor.save(roll);
  return state;
}

test("*Zap without privilege is a silent no-op (does not clear the roll)", () => {
  const state = seedRoll();
  const io = new ScriptedIo([]);
  const session = createSession(io);
  session.pasflg = false;
  zap(state, session);
  assert.equal(io.output, ""); // silent
  const roll = state.honor.load();
  assert.equal(roll.fed.length, 1);
  assert.equal(roll.emp.length, 1);
});

test("*Zap with pasflg=true clears both side rosters and prints Finished!", () => {
  const state = seedRoll();
  const io = new ScriptedIo([]);
  const session = createSession(io);
  session.pasflg = true;
  zap(state, session);
  assert.match(io.output, /Zapping statistics logs/);
  assert.match(io.output, /Finished!/);
  const roll = state.honor.load();
  assert.deepEqual(roll.fed, []);
  assert.deepEqual(roll.emp, []);
});

test("pre-game *Zap before *Password is silent", async () => {
  const state = seedRoll();
  const io = new ScriptedIo(["PREGAME", "*ZAP", "QUIT"]);
  const session = createSession(io);
  io.onHangup = () => { session.hungup = true; };
  await runLobby(state, session);
  assert.doesNotMatch(io.output, /Zapping/);
  const roll = state.honor.load();
  assert.equal(roll.fed.length, 1); // roll intact
});

test("pre-game *Zap after *Password clears the roll", async () => {
  const state = seedRoll();
  const io = new ScriptedIo(["PREGAME", "*PASSWORD *MINK", "*ZAP", "QUIT"]);
  const session = createSession(io);
  io.onHangup = () => { session.hungup = true; };
  await runLobby(state, session);
  assert.match(io.output, /Zapping statistics logs/);
  assert.match(io.output, /Finished!/);
  const roll = state.honor.load();
  assert.deepEqual(roll.fed, []);
  assert.deepEqual(roll.emp, []);
});

test("after *Zap, HONORROLL is silent again (roll truly empty)", async () => {
  const state = seedRoll();
  const io = new ScriptedIo([
    "PREGAME",
    "*PASSWORD *MINK",
    "*ZAP",
    "HONORROLL",
    "QUIT",
  ]);
  const session = createSession(io);
  io.onHangup = () => { session.hungup = true; };
  await runLobby(state, session);
  // The HONORROLL banner must NOT appear after the zap (the roll is gone).
  const afterZap = io.output.split("Finished!")[1] ?? "";
  assert.doesNotMatch(afterZap, /The DECWAR Honor Roll/);
});
