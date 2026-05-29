// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * Tests for TYPE (switch display) and USERS (active-captain list).
 * Pinned to DECWAR.FOR:4550–4604, 4610–4637.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { type as typeCmd } from "../../src/commands/type.ts";
import { users } from "../../src/commands/users.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import type { GameState } from "../../src/core/state.ts";
import type { Session } from "../../src/core/session.ts";

function game(): { state: GameState; a: Session; b: Session } {
  const state = createInitialGameState(new Rng(1));
  const a = createSession(new ScriptedIo([]));
  activate(state, a); // Excalibur (Fed #1)
  const b = createSession(new ScriptedIo([]));
  activate(state, b); // Buzzard (Emp #10)
  return { state, a, b };
}

const out = (s: Session): string => (s.io as ScriptedIo).output;

test("TYPE OUTPUT shows the player's switch settings", async () => {
  const { state, a } = game();
  await typeCmd(state, a, 1);
  const o = out(a);
  assert.match(o, /Medium output format\./); // oflg default medium
  assert.match(o, /Normal command prompt\./);
  assert.match(o, /Long SCAN format\./);
  assert.match(o, /coordinates are default for input\./);
});

test("TYPE OPTION shows the game options", async () => {
  const { state, a } = game();
  await typeCmd(state, a, 2);
  const o = out(a);
  assert.match(o, /DECWAR Version/); // version string
  assert.match(o, /There are Romulans in this game\./); // romopt default on
  assert.match(o, /Black holes are NOT in this game\./); // blhopt default off
});

test("TYPE O is ambiguous (matches OUTPUT and OPTION)", async () => {
  const state = createInitialGameState(new Rng(1));
  const a = createSession(new ScriptedIo(["OUTPUT"])); // answer the re-prompt
  activate(state, a);
  a.tokens = tokenize("TYPE O", 0).tokens;
  await typeCmd(state, a, 0);
  assert.match(out(a), /Ambiguous switch for TYPE\./);
});

test("USERS lists the active captains by ship and side", () => {
  const { state, a } = game();
  users(state, a);
  const o = out(a);
  assert.match(o, /Excalibur\s+Federation/);
  assert.match(o, /Buzzard\s+Empire/);
  assert.match(o, /----/); // side break after slot 9
});

test("USERS shows ship location when privileged", () => {
  const { state, a } = game();
  a.pasflg = true;
  users(state, a);
  // PRLOC(w=2, ocflg=BOTH, SHORT) → "vv-hh  +dv,+dh" with space-padded width-2 fields
  assert.match(out(a), /Excalibur\s+Federation\s+[ \d]+-[ \d]+\s+[ +-]\s*\d+,[ +-]\s*\d+/);
});

test("USERS omits ships that are not playing", () => {
  const { state, a } = game();
  state.alive[10] = 1; // Buzzard freed (available, not playing)
  const io = a.io as ScriptedIo;
  io.output = "";
  users(state, a);
  assert.doesNotMatch(out(a), /Buzzard/);
  assert.match(out(a), /Excalibur/);
});
