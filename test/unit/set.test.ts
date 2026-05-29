// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * SET — session flag toggles + privileged game-wide flags.
 * Source-pinned DECWAR.FOR:3609–3717; strings MSG.MAC:259–277.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { set } from "../../src/commands/set.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import { OFLG, COORD, DX } from "../../src/core/constants.ts";
import type { GameState } from "../../src/core/state.ts";
import type { Session } from "../../src/core/session.ts";

function fresh(scripted: string[] = []): { state: GameState; a: Session } {
  const state = createInitialGameState(new Rng(1));
  const io = new ScriptedIo(scripted);
  const a = createSession(io);
  io.onHangup = () => { a.hungup = true; }; // so prompt re-reads exit on script exhaustion
  activate(state, a);
  return { state, a };
}
const out = (s: Session): string => (s.io as ScriptedIo).output;
const reset = (s: Session): void => { (s.io as ScriptedIo).output = ""; };
const setArgs = (s: Session, line: string): void => {
  s.tokens = tokenize(line, 0).tokens;
  s.lineBuf = line;
};

test("SET OUTPUT SHORT/MEDIUM/LONG switches session.oflg", async () => {
  const { state, a } = fresh();
  setArgs(a, "SET OUTPUT SHORT");
  await set(state, a);
  assert.equal(a.oflg, OFLG.SHORT);

  setArgs(a, "SET OUTPUT MEDIUM");
  await set(state, a);
  assert.equal(a.oflg, OFLG.MEDIUM);

  setArgs(a, "SET OUTPUT LONG");
  await set(state, a);
  assert.equal(a.oflg, OFLG.LONG);
});

test("SET PROMPT NORMAL/INFORMATIVE switches session.prtype", async () => {
  const { state, a } = fresh();
  setArgs(a, "SET PROMPT INFORMATIVE");
  await set(state, a);
  assert.equal(a.prtype, -1);

  setArgs(a, "SET PROMPT NORMAL");
  await set(state, a);
  assert.equal(a.prtype, 0);
});

test("SET SCANS SHORT/LONG switches session.scnflg", async () => {
  const { state, a } = fresh();
  setArgs(a, "SET SCANS LONG");
  await set(state, a);
  assert.equal(a.scnflg, OFLG.LONG);

  setArgs(a, "SET SCANS SHORT");
  await set(state, a);
  assert.equal(a.scnflg, OFLG.SHORT);
});

test("SET ICDEF ABSOLUTE/RELATIVE switches session.icflg", async () => {
  const { state, a } = fresh();
  setArgs(a, "SET ICDEF RELATIVE");
  await set(state, a);
  assert.equal(a.icflg, COORD.REL);

  setArgs(a, "SET ICDEF ABSOLUTE");
  await set(state, a);
  assert.equal(a.icflg, COORD.ABS);
});

test("SET OCDEF ABSOLUTE/RELATIVE/BOTH switches session.ocflg", async () => {
  const { state, a } = fresh();
  setArgs(a, "SET OCDEF RELATIVE");
  await set(state, a);
  assert.equal(a.ocflg, COORD.REL);

  setArgs(a, "SET OCDEF BOTH");
  await set(state, a);
  assert.equal(a.ocflg, COORD.BOTH);

  setArgs(a, "SET OCDEF ABSOLUTE");
  await set(state, a);
  assert.equal(a.ocflg, COORD.ABS);
});

test("SET with no switch prompts SET001 then reads the keyword", async () => {
  const { state, a } = fresh(["OUTPUT LONG"]);
  setArgs(a, "SET");
  reset(a);
  await set(state, a);
  assert.match(out(a), /Name, Output, Ttytype/);
  assert.equal(a.oflg, OFLG.LONG);
});

test("SET OUTPUT with no value prompts SET003 then reads", async () => {
  const { state, a } = fresh(["SHORT"]);
  setArgs(a, "SET OUTPUT");
  reset(a);
  await set(state, a);
  assert.match(out(a), /Short, Medium, or Long/);
  assert.equal(a.oflg, OFLG.SHORT);
});

test("SET ROMOPT is privileged: pasflg=false → no change; pasflg=true → state.romopt=true", async () => {
  const { state, a } = fresh();
  state.romopt = false;
  a.pasflg = false;
  setArgs(a, "SET ROMOPT");
  await set(state, a);
  assert.equal(state.romopt, false, "ROMOPT shouldn't change without pasflg");

  a.pasflg = true;
  setArgs(a, "SET ROMOPT");
  await set(state, a);
  assert.equal(state.romopt, true);
});

test("SET BHREMV (privileged) clears black holes from the board", async () => {
  const { state, a } = fresh();
  // Plant a black hole.
  state.board.setdsp(40, 40, DX.BHOL * 100 + 1);
  a.pasflg = true;
  setArgs(a, "SET BHREMV");
  await set(state, a);
  assert.equal(state.board.disp(40, 40), 0);
});

test("SET NAME <name> captures the captain name from the same line", async () => {
  const { state, a } = fresh();
  setArgs(a, "SET NAME Kirk");
  await set(state, a);
  assert.equal(a.captain, "KIRK"); // upper-cased per USRNAM
});

test("SET NAME with no argument prompts SET002 and reads the next line", async () => {
  const { state, a } = fresh(["Picard"]);
  setArgs(a, "SET NAME");
  reset(a);
  await set(state, a);
  assert.match(out(a), /Desired name:/);
  assert.equal(a.captain, "PICARD");
});

test("SET NAME truncates to 12 characters (USRNAM's copy limit)", async () => {
  const { state, a } = fresh();
  setArgs(a, "SET NAME VeryLongCaptainName");
  await set(state, a);
  assert.equal(a.captain, "VERYLONGCAPT"); // first 12 chars upper-cased
});

test("SET NAME with a blank reply leaves captain unchanged", async () => {
  const { state, a } = fresh([""]);
  a.captain = "OLD";
  setArgs(a, "SET NAME");
  await set(state, a);
  assert.equal(a.captain, "OLD");
});

test("SET TTYTYPE still emits the 'not supported' notice (deferred indefinitely)", async () => {
  const { state, a } = fresh();
  setArgs(a, "SET TTYTYPE");
  reset(a);
  await set(state, a);
  assert.match(out(a), /SET TTYTYPE is not supported/);
});
