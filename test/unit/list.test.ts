/**
 * Tests for the LIST family — LIST/SUMMARY/BASES/PLANETS/TARGETS.
 * Pinned to DECWAR.FOR:1352–1396 (entries), LSTSCN 1512–1739 (grammar defaults),
 * LSTOUT/LSTSUM/LSTOBJ 1952–2110 (render): per-object lines with enemy `*` flag,
 * summary counts with " in range"/" in specified range"/" in game".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { list } from "../../src/commands/list.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import type { GameState } from "../../src/core/state.ts";
import type { Session } from "../../src/core/session.ts";

function fresh(): { state: GameState; a: Session } {
  const state = createInitialGameState(new Rng(1));
  const a = createSession(new ScriptedIo([]));
  activate(state, a); // Fed #1 Excalibur
  return { state, a };
}

const out = (s: Session): string => (s.io as ScriptedIo).output;
const reset = (s: Session): void => { (s.io as ScriptedIo).output = ""; };
const setArgs = (s: Session, line: string): void => {
  s.tokens = tokenize(line, 0).tokens;
};

test("LIST with no args reports objects in game (default range ∞)", () => {
  const { state, a } = fresh();
  setArgs(a, "LIST");
  list(state, a, "LIST");
  const o = out(a);
  assert.match(o, /Excalibur/); // own ship in the listing
  assert.match(o, /Federation base|Empire base/);
});

test("SUMMARY emits counted lines with 'in game' for range ∞", () => {
  const { state, a } = fresh();
  setArgs(a, "SUMMARY");
  list(state, a, "SUMMARY");
  const o = out(a);
  assert.match(o, /\d+ Federation ships? in game/);
  assert.match(o, /\d+ neutral planets? in game/);
});

test("BASES (own side) lists only own-team bases, no `*` flag", () => {
  const { state, a } = fresh();
  setArgs(a, "BASES");
  list(state, a, "BASES");
  const o = out(a);
  assert.match(o, /Federation base/);
  assert.doesNotMatch(o, /Empire base/);
  assert.doesNotMatch(o, /^\*/m); // no enemy flags for own-side BASES
});

test("PLANETS defaults to range 10 → 'in range' summary string when SUMMARY added", () => {
  const { state, a } = fresh();
  setArgs(a, "PLANETS SUMMARY"); // exercise the SUMMARY keyword
  list(state, a, "PLANETS");
  // Either no planets in range (nothing) or a count line ending with " in range"
  const o = out(a);
  if (/\d+ \w+ planets?/.test(o)) {
    assert.match(o, / in range/);
    assert.doesNotMatch(o, / in game/);
  }
});

test("TARGETS lists enemy objects + Romulan, no `*` flag (since they're targets)", () => {
  const { state, a } = fresh();
  // Force a Romulan within range to make this deterministic
  state.romulan.exists = true;
  state.romulan.vPos = state.ships[a.who]!.vPos;
  state.romulan.hPos = state.ships[a.who]!.hPos + 1;
  setArgs(a, "TARGETS");
  list(state, a, "TARGETS");
  const o = out(a);
  assert.match(o, /Romulan/);
  assert.doesNotMatch(o, /^\*/m); // TARGETS suppresses the enemy `*` (per LSTOBJ:2092)
});

test("user-supplied range marks SUMMARY lines with 'in specified range'", () => {
  const { state, a } = fresh();
  setArgs(a, "SUMMARY 30");
  list(state, a, "SUMMARY");
  const o = out(a);
  if (/\d+ \w+/.test(o)) {
    assert.match(o, / in specified range/);
  }
});

test("unrecognized keyword → 'Illegal keyword' (faithful lsts02; covers deferred grammar)", () => {
  const { state, a } = fresh();
  setArgs(a, "LIST CLOSEST"); // CLOSEST is deferred → illegal in this build
  list(state, a, "LIST");
  // tokenizer caps at 5 chars → "CLOSE"; faithful to the original error rendering
  assert.match(out(a), /Illegal keyword CLOSE/);
});

test("FRIENDLY shows own ships; ENEMY shows the other side", () => {
  const { state, a } = fresh();
  // Add a Buzzard (Empire) so there is enemy content
  const b = createSession(new ScriptedIo([]));
  activate(state, b);

  setArgs(a, "LIST FRIENDLY");
  list(state, a, "LIST");
  let o = out(a);
  assert.match(o, /Excalibur/);
  assert.doesNotMatch(o, /Buzzard/);

  reset(a);
  setArgs(a, "LIST ENEMY");
  list(state, a, "LIST");
  o = out(a);
  assert.match(o, /Buzzard/);
  assert.doesNotMatch(o, /Excalibur/);
});
