// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * HELP / NEWS / GRIPE / *Debug — minimal in-memory implementations.
 * Source-pinned WARMAC.MAC:4977–5100 (HELP), 4625–4676 (NEWS), 4682–4960 (GRIPE).
 * The file-loading machinery (DECWAR.HLP/.NWS/.GRP) is deferred to Phase F-3.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { help, news, gripe, debug } from "../../src/commands/help.ts";
import { InMemoryTextStore } from "../../src/persistence/textFiles.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import { COND } from "../../src/core/constants.ts";
import type { GameState } from "../../src/core/state.ts";
import type { Session } from "../../src/core/session.ts";

function fresh(scripted: string[] = []): { state: GameState; a: Session } {
  const state = createInitialGameState(new Rng(1));
  const io = new ScriptedIo(scripted);
  const a = createSession(io);
  io.onHangup = () => { a.hungup = true; };
  activate(state, a);
  return { state, a };
}
const out = (s: Session): string => (s.io as ScriptedIo).output;
const reset = (s: Session): void => { (s.io as ScriptedIo).output = ""; };
const setArgs = (s: Session, line: string): void => {
  s.tokens = tokenize(line, 0).tokens;
};

// ── HELP ─────────────────────────────────────────────────────────────────────────────────────

test("HELP with no args prints the general help summary", () => {
  const { state, a } = fresh();
  setArgs(a, "HELP");
  reset(a);
  help(state, a);
  assert.match(out(a), /DECWAR/);
  assert.match(out(a), /In-game commands/);
});

test("HELP * prints the topic table-of-contents", () => {
  // Seed the text store with a few .TOPIC sections so the TOC has content to show.
  const { state, a } = fresh();
  state.text = new InMemoryTextStore({
    helpText: "intro\n.STATUS\nstatus help\n.TORPEDOES\ntorp help\n",
  });
  setArgs(a, "HELP *");
  reset(a);
  help(state, a);
  assert.match(out(a), /HELP topics available:/);
  assert.match(out(a), /STATUS/);
  assert.match(out(a), /TORPEDOES/);
});

test("HELP <topic> falls back to a notice + TOC when the topic is unknown", () => {
  const { state, a } = fresh();
  setArgs(a, "HELP PHASERS");
  reset(a);
  help(state, a);
  // Tokens are capped at 5 chars (parser/tokenizer) → "PHASERS" becomes "PHASE" in display.
  assert.match(out(a), /\(No HELP entry for 'PHASE'\.\)/);
  assert.match(out(a), /HELP topics available:/);
});

test("HELP under RED alert is refused", () => {
  const { state, a } = fresh();
  state.ships[a.who]!.condition = COND.RED;
  setArgs(a, "HELP");
  reset(a);
  help(state, a);
  assert.match(out(a), /cannot get HELP/);
});

// ── NEWS ─────────────────────────────────────────────────────────────────────────────────────

test("NEWS prints the (placeholder) news text", () => {
  const { state, a } = fresh();
  setArgs(a, "NEWS");
  reset(a);
  news(state, a);
  assert.match(out(a), /DECWAR News/);
});

// ── GRIPE ────────────────────────────────────────────────────────────────────────────────────

test("GRIPE prompts, reads lines until '.', then acknowledges", async () => {
  const { state, a } = fresh(["This is my gripe.", "It is long.", "."]);
  setArgs(a, "GRIPE");
  reset(a);
  await gripe(state, a);
  assert.match(out(a), /Enter gripe/);
  assert.match(out(a), /Thank you, Captain/);
});

test("GRIPE under RED alert is refused", async () => {
  const { state, a } = fresh();
  state.ships[a.who]!.condition = COND.RED;
  setArgs(a, "GRIPE");
  reset(a);
  await gripe(state, a);
  assert.match(out(a), /not permitted to GRIPE/);
});

// ── *Debug ───────────────────────────────────────────────────────────────────────────────────

test("*Debug without pasflg is a silent no-op", () => {
  const { state, a } = fresh();
  setArgs(a, "*DEBUG");
  reset(a);
  debug(state, a);
  assert.equal(out(a), "");
});

test("*Debug with pasflg notes 'not available'", () => {
  const { state, a } = fresh();
  a.pasflg = true;
  setArgs(a, "*DEBUG");
  reset(a);
  debug(state, a);
  assert.match(out(a), /not available in this build/);
});
