/**
 * BUILD — fortify a friendly captured planet; 5th stage converts it to a starbase.
 * Source-pinned DECWAR.FOR:520–591; strings MSG.MAC:12–19.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { build } from "../../src/commands/build.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import { KNBASE, DX, PT } from "../../src/core/constants.ts";
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

/** Plant a friendly captured planet at (v,h) and return its slot index. Also clears any board obstacle. */
function placeFriendlyPlanetAdjacent(state: GameState, session: Session): { slot: number; v: number; h: number } {
  const ship = state.ships[session.who]!;
  const v = ship.vPos + 1, h = ship.hPos;
  // Use slot nplnet+1 (append a fresh planet).
  state.nplnet++;
  const slot = state.nplnet;
  state.planets[slot] = { vPos: v, hPos: h, buildCount: 0, scanMask: 0 };
  state.board.setdsp(v, h, (DX.NPLN + session.team) * 100 + slot);
  state.numcap[session.team] = (state.numcap[session.team] ?? 0) + 1;
  return { slot, v, h };
}

test("BUILD on a non-adjacent sector → captu5 refusal, no mutation", async () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  setArgs(a, `BUILD ${ship.vPos + 20} ${ship.hPos}`);
  reset(a);
  const tc = await build(state, a);
  assert.equal(tc, false);
  assert.match(out(a), /not adjacent to planet/);
});

test("BUILD on a non-planet sector → noplnt", async () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  // Pick an empty adjacent cell (force it empty).
  const v = ship.vPos + 1, h = ship.hPos;
  state.board.setdsp(v, h, 0);
  setArgs(a, `BUILD ${v} ${h}`);
  reset(a);
  const tc = await build(state, a);
  assert.equal(tc, false);
  assert.match(out(a), /No planet at those coordinates/);
});

test("BUILD on a neutral planet → build7 (Planet not yet captured)", async () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  const v = ship.vPos + 1, h = ship.hPos;
  // Put a neutral planet there.
  state.nplnet++;
  const slot = state.nplnet;
  state.planets[slot] = { vPos: v, hPos: h, buildCount: 0, scanMask: 0 };
  state.board.setdsp(v, h, DX.NPLN * 100 + slot);
  setArgs(a, `BUILD ${v} ${h}`);
  reset(a);
  const tc = await build(state, a);
  assert.equal(tc, false);
  assert.match(out(a), /Planet not yet captured/);
});

test("BUILD stages 1..4 increment buildCount, emit '<n> build(s)', accumulate KPBBAS", async () => {
  const { state, a } = fresh();
  const { slot, v, h } = placeFriendlyPlanetAdjacent(state, a);
  setArgs(a, `BUILD ${v} ${h}`);
  reset(a);
  await build(state, a);
  assert.equal(state.planets[slot]!.buildCount, 1);
  assert.match(out(a), /^1 build\r\n/);
  assert.equal(a.tpoint[PT.KPBBAS] ?? 0, 500);

  setArgs(a, `BUILD ${v} ${h}`);
  reset(a);
  await build(state, a);
  assert.equal(state.planets[slot]!.buildCount, 2);
  assert.match(out(a), /^2 builds\r\n/);
  assert.equal(a.tpoint[PT.KPBBAS] ?? 0, 500 + 1000);
});

test("BUILD stage-4 planet with all bases full → build4/build5 refusal", async () => {
  const { state, a } = fresh();
  const { v, h, slot } = placeFriendlyPlanetAdjacent(state, a);
  state.planets[slot]!.buildCount = 4;
  state.nbase[a.team] = KNBASE; // all bases active
  // (the universe-init already gave us KNBASE alive bases for both sides)
  setArgs(a, `BUILD ${v} ${h}`);
  reset(a);
  const tc = await build(state, a);
  assert.equal(tc, false);
  assert.equal(state.planets[slot]!.buildCount, 4, "no mutation on refusal");
  assert.match(out(a), /All .*still functional, captain/);
});

test("BUILD stage-4 → stage-5 with an empty base slot: planet→starbase conversion", async () => {
  const { state, a } = fresh();
  const { slot: planetSlot, v, h } = placeFriendlyPlanetAdjacent(state, a);
  state.planets[planetSlot]!.buildCount = 4;
  // Free up a base slot for the new starbase.
  const baseSlot = 1;
  state.bases[a.team]![baseSlot]!.strength = 0;
  state.nbase[a.team] = KNBASE - 1;
  const nplnetBefore = state.nplnet;

  setArgs(a, `BUILD ${v} ${h}`);
  reset(a);
  const tc = await build(state, a);
  assert.equal(tc, true, "time-consuming on successful conversion");
  // Planet removed
  assert.equal(state.nplnet, nplnetBefore - 1, "planet array compacted");
  // Base initialized
  const newBase = state.bases[a.team]![baseSlot]!;
  assert.equal(newBase.vPos, v);
  assert.equal(newBase.hPos, h);
  assert.equal(newBase.strength, 1000);
  assert.equal(state.nbase[a.team], KNBASE);
  // Board cell flipped to starbase code
  const expected = (DX.FBAS + a.team - 1) * 100 + baseSlot;
  assert.equal(state.board.disp(v, h), expected);
  // Scoring: 500*5 (stage 5) + 2500 bonus
  assert.equal(a.tpoint[PT.KPBBAS] ?? 0, 500 * 5 + 2500);
  // Output mentions "builds planet" and "into a"
  assert.match(out(a), /builds planet/);
  assert.match(out(a), /into a/);
});

test("After BUILD→base conversion, follow-up BUILD on same coords → noplnt (it's a base now)", async () => {
  const { state, a } = fresh();
  const { slot: planetSlot, v, h } = placeFriendlyPlanetAdjacent(state, a);
  state.planets[planetSlot]!.buildCount = 4;
  state.bases[a.team]![1]!.strength = 0;
  state.nbase[a.team] = KNBASE - 1;
  setArgs(a, `BUILD ${v} ${h}`);
  await build(state, a);

  // Same coords — now a base, not a planet.
  setArgs(a, `BUILD ${v} ${h}`);
  reset(a);
  const tc = await build(state, a);
  assert.equal(tc, false);
  assert.match(out(a), /No planet at those coordinates/);
});

test("plnrmv: when a middle planet is removed, board codes of shifted planets decrement by 1", async () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  // Append two fresh friendly planets at distinct adjacent-ish cells.
  state.nplnet++;
  const p1 = state.nplnet;
  const v1 = ship.vPos + 1, h1 = ship.hPos;
  state.planets[p1] = { vPos: v1, hPos: h1, buildCount: 4, scanMask: 0 };
  state.board.setdsp(v1, h1, (DX.NPLN + a.team) * 100 + p1);
  state.numcap[a.team] = (state.numcap[a.team] ?? 0) + 1;

  state.nplnet++;
  const p2 = state.nplnet;
  const v2 = ship.vPos + 5, h2 = ship.hPos + 5;
  state.planets[p2] = { vPos: v2, hPos: h2, buildCount: 0, scanMask: 0 };
  state.board.setdsp(v2, h2, (DX.NPLN + a.team) * 100 + p2);
  state.numcap[a.team] = (state.numcap[a.team] ?? 0) + 1;

  // Free a base slot and run BUILD to convert p1 → starbase.
  state.bases[a.team]![1]!.strength = 0;
  state.nbase[a.team] = KNBASE - 1;
  setArgs(a, `BUILD ${v1} ${h1}`);
  await build(state, a);

  // p2 should now be at index p1 (shifted down) with its DISP code decremented.
  const movedDisp = state.board.disp(v2, h2);
  assert.equal(movedDisp, (DX.NPLN + a.team) * 100 + (p2 - 1));
});
