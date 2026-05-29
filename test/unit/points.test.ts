// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * POINTS — itemized scoring breakdown.
 * Pinned to DECWAR.FOR:2880–3033; MSG.MAC:209–247.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { points } from "../../src/commands/points.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import type { GameState } from "../../src/core/state.ts";
import type { Session } from "../../src/core/session.ts";

function fresh(): { state: GameState; a: Session } {
  const state = createInitialGameState(new Rng(1));
  const a = createSession(new ScriptedIo([]));
  activate(state, a);
  return { state, a };
}
const out = (s: Session): string => (s.io as ScriptedIo).output;
const reset = (s: Session): void => { (s.io as ScriptedIo).output = ""; };
const setArgs = (s: Session, line: string): void => {
  s.tokens = tokenize(line, 0).tokens;
};

test("POINTS with no args defaults to 'me' (in-game iflg)", () => {
  const { state, a } = fresh();
  state.score[1]![a.who] = 250; // damage to enemies — Tenths
  state.score[2]![a.who] = 10;  // enemies destroyed
  setArgs(a, "POINTS");
  points(state, a);
  const o = out(a);
  assert.match(o, /Damage to enemies/);
  assert.match(o, /Total points:/);
  assert.match(o, /Pts\. \/ stardate:/);
  assert.doesNotMatch(o, /Federation\s*$/m); // no team column when iflg only
});

test("POINTS FEDERATION shows the Fed column with totals & ship-count rows", () => {
  const { state, a } = fresh();
  state.tmscor[1]![1] = 1000; // damage to enemies, Fed
  state.tmscor[1]![3] = 500;  // damage to bases, Fed
  state.numshp[1] = 2; state.tmturn[1] = 4;
  setArgs(a, "POINTS FEDERATION");
  points(state, a);
  const o = out(a);
  assert.match(o, /Damage to enemies/);
  assert.match(o, /Damage to bases/);
  assert.match(o, /Number of ships:/);
  assert.match(o, /Pts\. \/ player:/);
});

test("POINTS ALL turns on every team flag (+ iflg in-game)", () => {
  const { state, a } = fresh();
  state.score[1]![a.who] = 100;
  state.tmscor[1]![1] = 200;
  state.tmscor[2]![1] = 300;
  state.romulan.score[1] = 400;
  setArgs(a, "POINTS ALL");
  points(state, a);
  const o = out(a);
  assert.match(o, /Federation\s+Empire\s+Romulan/); // header has all three
  assert.match(o, /Total points:/);
});

test("ROMULANS without romopt is silently dropped", () => {
  const { state, a } = fresh();
  state.romopt = false;
  state.romulan.score[1] = 500;
  setArgs(a, "POINTS ROMULANS"); // rflg gets set then cleared; if nothing else → POIN04
  points(state, a);
  assert.match(out(a), /Incorrect input, POINTS aborted/);
});

test("an unrecognized keyword aborts with poin04", () => {
  const { state, a } = fresh();
  setArgs(a, "POINTS FLEA"); // garbage
  points(state, a);
  assert.match(out(a), /Incorrect input, POINTS aborted/);
});

test("categories with no nonzero column are skipped (matches source)", () => {
  const { state, a } = fresh();
  // only category 1 has a value for me; nothing else
  state.score[1]![a.who] = 100;
  setArgs(a, "POINTS ME");
  points(state, a);
  const o = out(a);
  assert.match(o, /Damage to enemies/);
  assert.doesNotMatch(o, /Damage to bases/);
  assert.doesNotMatch(o, /Stars destroyed/);
});

test("safe divide: no crash when ship/turn count is zero", () => {
  const { state, a } = fresh();
  state.numshp[1] = 0; state.tmturn[1] = 0; // a brand-new Fed side
  state.tmscor[1]![1] = 1000;
  setArgs(a, "POINTS FEDERATION");
  reset(a);
  assert.doesNotThrow(() => points(state, a));
  assert.match(out(a), /Pts\. \/ stardate:/);
});

test("long mode prints the per-category point-value suffixes (poin19–23)", () => {
  const { state, a } = fresh();
  a.oflg = 1; // LONG
  // Score in every category so they all appear; ME column drives the rows.
  for (let i = 1; i <= 8; i++) state.score[i]![a.who] = 10;
  setArgs(a, "POINTS ME");
  reset(a);
  points(state, a);
  const o = out(a);
  // Items with point-value suffixes: 2/6 → " ( 500)", 4 → " ( 100)", 5 → " (1000)",
  // 7 → " ( -50)", 8 → " (-100)". Items 1/3 use tab(26) (no suffix).
  // Labels (POI*L) are 18-char padded; POIN19–23 has a leading space → 2 spaces between.
  assert.match(o, /Enemies destroyed  \( 500\)/);
  assert.match(o, /Planets captured   \( 100\)/);
  assert.match(o, /Bases built        \(1000\)/);
  assert.match(o, /Damage to Romulans \( 500\)/);
  assert.match(o, /Stars destroyed    \( -50\)/);
  assert.match(o, /Planets destroyed  \(-100\)/);
});
