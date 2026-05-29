// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 Eric Freeman and The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Tests for the pre-game lobby (PREGAM/XGTCMD). Pinned to SETUP.FOR:92–169, 473–531.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { runLobby } from "../../src/lifecycle/lobby.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";

async function runWith(lines: string[]) {
  const state = createInitialGameState(new Rng(11));
  const io = new ScriptedIo(lines);
  const session = createSession(io);
  io.onHangup = () => {
    session.hungup = true;
  };
  const activated = await runLobby(state, session);
  return { state, session, io, activated };
}

/**
 * After the STRTUP prompt, activation runs the SETUP cascade: setu02 (Regular/Tournament),
 * setu04 (Romulan), setu05 (black holes), side prompt (only if fleets within 1 — for the
 * very first player both fleets are 0, so setu18 fires), ship prompt (setu14, requires
 * a real ship name). Each test below uses blank answers to take the defaults, then names
 * its ship explicitly.
 */
const FIRST_PLAYER_DEFAULTS = ["", "", "", "", "Excalibur"]; // setu02, setu04, setu05, setu18, setu14

test("a blank line at the strtup prompt activates immediately", async () => {
  const { activated, session, io } = await runWith(["", ...FIRST_PLAYER_DEFAULTS]);
  assert.equal(activated, true);
  assert.equal(session.who, 1); // → Excalibur
  assert.match(io.output, /Enter HELp, PREgame, or blank/);
  assert.match(io.output, /Regular or Tournament game\? \(Regular\) /);
  assert.match(io.output, /Is the Romulan Empire involved in this conflict\? \(yes\) /);
  assert.match(io.output, /Do you want black holes\? \(no\) /);
  assert.match(io.output, /Which side do you wish to join\?/);
  assert.match(io.output, /You will join the Federation\./);
  assert.match(io.output, /These vessels are available:/);
  assert.match(io.output, /Which vessel do you desire\? /);
  assert.match(io.output, /commanding the Federation ship Excalibur\./);
});

test("PREGAME enters the PG> loop, then ACTIVATE starts the game", async () => {
  const { activated, session, io } = await runWith(["PREGAME", "ACTIVATE", ...FIRST_PLAYER_DEFAULTS]);
  assert.equal(activated, true);
  assert.ok(session.who > 0);
  assert.match(io.output, /PG> /);
  assert.match(io.output, /Now entering DECWAR Pre-game/);
});

test("an in-game-only command in the lobby yields 'maicom'", async () => {
  const { io } = await runWith(["PREGAME", "MOVE", "QUIT"]);
  assert.match(io.output, /This command unavailable in Pre-game/);
});

test("an unknown pre-game word yields 'unkcom'", async () => {
  const { io } = await runWith(["PREGAME", "XYZZY", "QUIT"]);
  assert.match(io.output, /Unknown command -- for help type HELP/);
});

test("an ambiguous pre-game abbreviation yields 'ambcom'", async () => {
  const { io } = await runWith(["PREGAME", "S", "QUIT"]); // SET / SUMMARY
  assert.match(io.output, /Ambiguous command -- for help type HELP/);
});

test("pre-game QUIT leaves without activating", async () => {
  const { activated, session } = await runWith(["PREGAME", "QUIT"]);
  assert.equal(activated, false);
  assert.equal(session.who, 0);
});
