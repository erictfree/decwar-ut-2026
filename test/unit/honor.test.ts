// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Tests for HONORROLL display (F-3-3). Pinned to WARMAC.MAC:5856–5969 (shosta + dofed/doemp)
 * and SETUP.FOR:110–112 (STRTUP) / 145 (PG> dispatch entry 5).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { honor } from "../../src/commands/honor.ts";
import { runLobby } from "../../src/lifecycle/lobby.ts";
import { TEAM } from "../../src/core/constants.ts";
import { upsertEntry, type HonorEntry } from "../../src/persistence/honorRoll.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import type { GameState } from "../../src/core/state.ts";

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

function fresh(): { state: GameState; session: ReturnType<typeof createSession>; io: ScriptedIo } {
  const state = createInitialGameState(new Rng(11));
  const io = new ScriptedIo([]);
  const session = createSession(io);
  return { state, session, io };
}

test("HONORROLL on an empty roll emits no output (source shockp bail)", () => {
  const { state, session, io } = fresh();
  honor(state, session);
  assert.equal(io.output, "");
});

test("HONORROLL shows the banner when any entry exists", () => {
  const { state, session, io } = fresh();
  const roll = state.honor.load();
  upsertEntry(roll, TEAM.FED, entry({ captain: "KIRK", alive: false }));
  state.honor.save(roll);
  honor(state, session);
  assert.match(io.output, /The DECWAR Honor Roll/);
  assert.match(io.output, /\(\* indicates Missing in Action\)/);
});

test("HONORROLL flags fallen captains with a leading *", () => {
  const { state, session, io } = fresh();
  const roll = state.honor.load();
  upsertEntry(roll, TEAM.FED, entry({ captain: "KIRK", alive: false }));
  upsertEntry(roll, TEAM.FED, entry({ identity: "p", captain: "PICARD", alive: true, ship: 2 }));
  state.honor.save(roll);
  honor(state, session);
  assert.match(io.output, /\*KIRK/); // fallen → *
  assert.match(io.output, / PICARD/); // living → space
});

test("HONORROLL shows Fed first when Fed has more living high-rollers", () => {
  const { state, session, io } = fresh();
  const roll = state.honor.load();
  upsertEntry(roll, TEAM.FED, entry({ identity: "f1", captain: "KIRK", alive: true, ship: 1 }));
  upsertEntry(roll, TEAM.FED, entry({ identity: "f2", captain: "PICARD", alive: true, ship: 2 }));
  upsertEntry(roll, TEAM.EMP, entry({ identity: "e1", captain: "KOR", alive: true, ship: 10 }));
  state.honor.save(roll);
  honor(state, session);
  const fedIdx = io.output.indexOf("Federation has awarded");
  const empIdx = io.output.indexOf("served\r\ntheir Empire well");
  assert.ok(fedIdx >= 0);
  assert.ok(empIdx >= 0);
  assert.ok(fedIdx < empIdx, "Federation section should precede Empire");
});

test("HONORROLL shows Empire first when Empire has more living high-rollers", () => {
  const { state, session, io } = fresh();
  const roll = state.honor.load();
  upsertEntry(roll, TEAM.EMP, entry({ identity: "e1", captain: "KOR", alive: true, ship: 10 }));
  upsertEntry(roll, TEAM.EMP, entry({ identity: "e2", captain: "GOWRON", alive: true, ship: 11 }));
  upsertEntry(roll, TEAM.FED, entry({ identity: "f1", captain: "KIRK", alive: true, ship: 1 }));
  state.honor.save(roll);
  honor(state, session);
  const fedIdx = io.output.indexOf("Federation has awarded");
  const empIdx = io.output.indexOf("served\r\ntheir Empire well");
  assert.ok(empIdx < fedIdx, "Empire section should precede Federation");
});

test("HONORROLL splits each side into Emerald (living) and Golden (fallen) sections", () => {
  const { state, session, io } = fresh();
  const roll = state.honor.load();
  upsertEntry(roll, TEAM.FED, entry({ identity: "live", captain: "KIRK", alive: true, ship: 1 }));
  upsertEntry(roll, TEAM.FED, entry({ identity: "dead", captain: "PICARD", alive: false, ship: 2 }));
  state.honor.save(roll);
  honor(state, session);
  assert.match(io.output, /Emerald\r\nStar Cluster/);
  assert.match(io.output, /Golden Galaxy Medal/);
  // Living KIRK comes before fallen PICARD within the Federation section.
  const kirkIdx = io.output.indexOf("KIRK");
  const picardIdx = io.output.indexOf("PICARD");
  assert.ok(kirkIdx < picardIdx);
});

test("HONORROLL renders ship name and score for each entry", () => {
  const { state, session, io } = fresh();
  const roll = state.honor.load();
  upsertEntry(roll, TEAM.FED, entry({ captain: "KIRK", ship: 1, score: 1250, alive: false }));
  state.honor.save(roll);
  honor(state, session);
  assert.match(io.output, /KIRK/);
  assert.match(io.output, /Excalibur/);
  assert.match(io.output, /1250/);
});

test("HONORROLL via STRTUP HELP-prompt path (SETUP.FOR:110) renders then re-prompts", async () => {
  const state = createInitialGameState(new Rng(11));
  const roll = state.honor.load();
  upsertEntry(roll, TEAM.FED, entry({ captain: "KIRK", ship: 1, score: 99, alive: false }));
  state.honor.save(roll);
  const io = new ScriptedIo(["HONORROLL", "PREGAME", "QUIT"]);
  const session = createSession(io);
  io.onHangup = () => { session.hungup = true; };
  await runLobby(state, session);
  assert.match(io.output, /The DECWAR Honor Roll/);
  // After HONORROLL the STRTUP prompt fires again.
  const banner = io.output.match(/Enter HELp, PREgame, or blank/g) ?? [];
  assert.ok(banner.length >= 2, "STRTUP prompt should appear again after HONORROLL");
});

test("HONORROLL via PG> dispatch (SETUP.FOR:145) renders and stays in PG> loop", async () => {
  const state = createInitialGameState(new Rng(11));
  const roll = state.honor.load();
  upsertEntry(roll, TEAM.FED, entry({ captain: "KIRK", ship: 1, score: 99, alive: false }));
  state.honor.save(roll);
  const io = new ScriptedIo(["PREGAME", "HONORROLL", "QUIT"]);
  const session = createSession(io);
  io.onHangup = () => { session.hungup = true; };
  await runLobby(state, session);
  assert.match(io.output, /The DECWAR Honor Roll/);
  // PG> prompt appears at least twice — once before HONORROLL, once after.
  const pg = io.output.match(/PG> /g) ?? [];
  assert.ok(pg.length >= 2);
});
