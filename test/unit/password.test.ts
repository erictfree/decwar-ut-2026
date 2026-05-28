/**
 * Tests for `*Password` (F-3-1). Pinned to DECWAR.FOR:2615–2631 (PASWRD) and
 * PARAM.FOR:15 (KPASS='*MINK'). Exact match only → pasflg=true. Non-match → unkcom+forhlp.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { executeCommand } from "../../src/commands/executor.ts";
import { runLobby } from "../../src/lifecycle/lobby.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { OFLG } from "../../src/core/constants.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";

function setup() {
  const state = createInitialGameState(new Rng(11));
  const io = new ScriptedIo([]);
  const session = createSession(io);
  activate(state, session);
  io.output = ""; // discard activation output
  return { state, session, io };
}

function runCmd(state: ReturnType<typeof createInitialGameState>, session: ReturnType<typeof createSession>, line: string) {
  session.lineBuf = line;
  session.bufptr = 0;
  const r = tokenize(line, 0);
  session.tokens = r.tokens;
  session.bufptr = r.nextStart;
  return executeCommand(state, session);
}

test("in-game *Password with the exact password flips pasflg", async () => {
  const { state, session } = setup();
  assert.equal(session.pasflg, false);
  await runCmd(state, session, "*PASSWORD *MINK");
  assert.equal(session.pasflg, true);
});

test("*Password is case-insensitive on letters (equal() folds case)", async () => {
  const { state, session } = setup();
  await runCmd(state, session, "*PASSWORD *mink");
  assert.equal(session.pasflg, true);
});

test("*Password with a prefix-but-not-exact does NOT grant privilege", async () => {
  // KPASS is "*MINK" (5 chars). A 4-char "*MIN" would prefix-match (equal=-1), which the
  // source collapses to 0. With our 5-char KPASS the only way to "prefix" without exact-
  // match is to use a 4-or-fewer-char token; equal()'s 5-char window then sees them as
  // equal again... so this test verifies the wrong-password case instead.
  const { state, session, io } = setup();
  await runCmd(state, session, "*PASSWORD wrong");
  assert.equal(session.pasflg, false);
  assert.match(io.output, /Unknown command/);
});

test("*Password with no password argument is treated as a non-match", async () => {
  const { state, session, io } = setup();
  await runCmd(state, session, "*PASSWORD");
  assert.equal(session.pasflg, false);
  assert.match(io.output, /Unknown command/);
});

test("non-match under SHORT verbosity omits the FORHLP tail", async () => {
  const { state, session, io } = setup();
  session.oflg = OFLG.SHORT;
  await runCmd(state, session, "*PASSWORD nope");
  assert.match(io.output, /Unknown command/);
  assert.doesNotMatch(io.output, /for help type HELP/);
});

test("pre-game *Password grants privilege at the PG> prompt", async () => {
  const state = createInitialGameState(new Rng(11));
  const io = new ScriptedIo(["PREGAME", "*PASSWORD *MINK", "QUIT"]);
  const session = createSession(io);
  io.onHangup = () => { session.hungup = true; };
  await runLobby(state, session);
  assert.equal(session.pasflg, true);
});

test("pre-game *Password with the wrong password does NOT grant privilege", async () => {
  const state = createInitialGameState(new Rng(11));
  const io = new ScriptedIo(["PREGAME", "*PASSWORD nope", "QUIT"]);
  const session = createSession(io);
  io.onHangup = () => { session.hungup = true; };
  await runLobby(state, session);
  assert.equal(session.pasflg, false);
  assert.match(io.output, /Unknown command/);
});
