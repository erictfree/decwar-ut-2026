/**
 * REPAIR (command form) — DECWAR.FOR:3177–3209. Reuses end-of-turn scheduler.repair's spirit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { repairCmd } from "../../src/commands/repair.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import { DEV } from "../../src/core/constants.ts";
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

test("REPAIR undocked uses mode 1 (size 500)", () => {
  const { state, a } = fresh();
  const dev = state.devices[a.who]!;
  dev[DEV.KDSHLD] = 1200;
  dev[DEV.KDPHAS] = 700;
  setArgs(a, "REPAIR");
  reset(a);
  const tc = repairCmd(state, a);
  assert.equal(tc, true);
  // maxd=1200; repsiz=min(500,1200)=500. Subtract 500 from each.
  assert.equal(dev[DEV.KDSHLD], 700);
  assert.equal(dev[DEV.KDPHAS], 200);
});

test("REPAIR docked uses mode 2 (size 1000)", () => {
  const { state, a } = fresh();
  state.docked[a.who] = -1; // docked
  const dev = state.devices[a.who]!;
  dev[DEV.KDSHLD] = 1200;
  dev[DEV.KDPHAS] = 700;
  setArgs(a, "REPAIR");
  reset(a);
  repairCmd(state, a);
  // maxd=1200; repsiz=min(1000,1200)=1000. Subtract 1000 from each, floor 0.
  assert.equal(dev[DEV.KDSHLD], 200);
  assert.equal(dev[DEV.KDPHAS], 0);
});

test("REPAIR ALL repairs the worst device fully (repsiz = maxd)", () => {
  const { state, a } = fresh();
  const dev = state.devices[a.who]!;
  dev[DEV.KDSHLD] = 1200;
  dev[DEV.KDPHAS] = 800;
  setArgs(a, "REPAIR ALL");
  reset(a);
  repairCmd(state, a);
  // repsiz=maxd=1200. Subtract 1200 from each, floor 0.
  assert.equal(dev[DEV.KDSHLD], 0);
  assert.equal(dev[DEV.KDPHAS], 0);
});

test("REPAIR <n>: numeric override uses vallst(2)*10", () => {
  const { state, a } = fresh();
  const dev = state.devices[a.who]!;
  dev[DEV.KDSHLD] = 1200;
  dev[DEV.KDPHAS] = 700;
  setArgs(a, "REPAIR 50"); // 50 raw → repsiz=500 ×10
  reset(a);
  repairCmd(state, a);
  assert.equal(dev[DEV.KDSHLD], 700);
  assert.equal(dev[DEV.KDPHAS], 200);
});

test("REPAIR <n>: clamped at maxd", () => {
  const { state, a } = fresh();
  const dev = state.devices[a.who]!;
  dev[DEV.KDSHLD] = 100;
  setArgs(a, "REPAIR 200"); // 200 raw → 2000 ×10; clamped to maxd=100
  reset(a);
  repairCmd(state, a);
  assert.equal(dev[DEV.KDSHLD], 0);
});

test("REPAIR DAMAGE appends the damage report", () => {
  const { state, a } = fresh();
  const dev = state.devices[a.who]!;
  dev[DEV.KDSHLD] = 1200;
  setArgs(a, "REPAIR DAMAGE");
  reset(a);
  repairCmd(state, a);
  // After repair shields are 700 — the damage report shows them.
  assert.match(out(a), /Device\s+Damage/);
  assert.match(out(a), /Shields\s+70\.0/);
});

test("REPAIR with no damaged devices is non-time-consuming and a no-op", () => {
  const { state, a } = fresh();
  setArgs(a, "REPAIR");
  reset(a);
  const tc = repairCmd(state, a);
  assert.equal(tc, false);
});
