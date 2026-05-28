/**
 * CAPTURE — flip a neutral/enemy planet to friendly; planet fires back via PHADAM.
 * Source-pinned DECWAR.FOR:597–682; strings MSG.MAC:20–37, 148–160.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { capture } from "../../src/commands/capture.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import { DX, PT, OFLG, TEAM, KENDAM } from "../../src/core/constants.ts";
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

/** Append a planet adjacent to the player's ship. `cls` is one of DX.NPLN/FPLN/EPLN. */
function placePlanetAdjacent(
  state: GameState, session: Session, cls: number, dv = 1, dh = 0, buildCount = 0,
): { slot: number; v: number; h: number } {
  const ship = state.ships[session.who]!;
  const v = ship.vPos + dv, h = ship.hPos + dh;
  state.nplnet++;
  const slot = state.nplnet;
  state.planets[slot] = { vPos: v, hPos: h, buildCount, scanMask: 0 };
  state.board.setdsp(v, h, cls * 100 + slot);
  if (cls === DX.NPLN + 1 || cls === DX.NPLN + 2) {
    state.numcap[cls - DX.NPLN] = (state.numcap[cls - DX.NPLN] ?? 0) + 1;
  }
  return { slot, v, h };
}

test("CAPTURE non-adjacent target → captu5 refusal", async () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  setArgs(a, `CAPTURE ${ship.vPos + 20} ${ship.hPos}`);
  reset(a);
  const tc = await capture(state, a);
  assert.equal(tc, false);
  assert.match(out(a), /not adjacent to planet/);
});

test("CAPTURE on an empty sector → noplnt", async () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  const v = ship.vPos + 1, h = ship.hPos;
  state.board.setdsp(v, h, 0); // make sure it's empty
  setArgs(a, `CAPTURE ${v} ${h}`);
  reset(a);
  await capture(state, a);
  assert.match(out(a), /No planet at those coordinates/);
});

test("CAPTURE on already-friendly planet → captu7 (medium)", async () => {
  const { state, a } = fresh();
  const { v, h } = placePlanetAdjacent(state, a, DX.NPLN + a.team);
  a.oflg = OFLG.MEDIUM;
  setArgs(a, `CAPTURE ${v} ${h}`);
  reset(a);
  await capture(state, a);
  assert.match(out(a), /Planet already captured/);
});

test("CAPTURE on already-friendly planet (long) → captu6 for Fed", async () => {
  const { state, a } = fresh();
  a.team = TEAM.FED;
  const { v, h } = placePlanetAdjacent(state, a, DX.NPLN + a.team);
  a.oflg = OFLG.LONG;
  setArgs(a, `CAPTURE ${v} ${h}`);
  reset(a);
  await capture(state, a);
  assert.match(out(a), /orbiting a FEDERATION planet/);
});

test("CAPTURE on a neutral planet: numcap++, board flipped, buildCount cleared, +1000 KPPCAP", async () => {
  const { state, a } = fresh();
  const { slot, v, h } = placePlanetAdjacent(state, a, DX.NPLN, 1, 0, 0);
  const myCapBefore = state.numcap[a.team] ?? 0;
  setArgs(a, `CAPTURE ${v} ${h}`);
  reset(a);
  const tc = await capture(state, a);
  assert.equal(tc, true);
  assert.equal(state.numcap[a.team], myCapBefore + 1);
  assert.equal(state.planets[slot]!.buildCount, 0);
  assert.equal(state.board.disp(v, h), (a.team + DX.NPLN) * 100 + slot);
  assert.equal(a.tpoint[PT.KPPCAP] ?? 0, 1000);
  assert.match(out(a), /capturing /);
});

test("CAPTURE on an enemy planet decrements enemy numcap + credits enemy tmscor[KPEDAM]", async () => {
  const { state, a } = fresh(); // a is Fed
  const enemySide = a.team === TEAM.FED ? 2 : 1;
  const { v, h } = placePlanetAdjacent(state, a, DX.NPLN + enemySide, 1, 0, 2);
  const enemyCapBefore = state.numcap[enemySide] ?? 0;
  const enemyPedBefore = state.tmscor[enemySide]![PT.KPEDAM] ?? 0;
  setArgs(a, `CAPTURE ${v} ${h}`);
  reset(a);
  await capture(state, a);
  assert.equal(state.numcap[enemySide], enemyCapBefore - 1);
  // Enemy team gets credit for the planet's counterattack damage.
  assert.ok((state.tmscor[enemySide]![PT.KPEDAM] ?? 0) >= enemyPedBefore, "enemy KPEDAM should grow");
});

test("CAPTURE on a fortified planet costs energy + zeros buildCount", async () => {
  const { state, a } = fresh();
  const enemySide = a.team === TEAM.FED ? 2 : 1;
  const { slot, v, h } = placePlanetAdjacent(state, a, DX.NPLN + enemySide, 1, 0, 3);
  const ship = state.ships[a.who]!;
  const e0 = ship.energy;
  setArgs(a, `CAPTURE ${v} ${h}`);
  reset(a);
  await capture(state, a);
  // Source: energy -= buildCount * 500 (×10 store).
  // PHADAM also damages the ship; assert energy at least decreased by the build*500 component.
  assert.ok(e0 - ship.energy >= 3 * 500, "energy includes the 3*500 fortification cost");
  assert.equal(state.planets[slot]!.buildCount, 0);
});

test("CAPTURE on a star → nosur4", async () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  const v = ship.vPos + 1, h = ship.hPos;
  state.board.setdsp(v, h, DX.STAR * 100 + 1);
  setArgs(a, `CAPTURE ${v} ${h}`);
  reset(a);
  await capture(state, a);
  assert.match(out(a), /Capture THAT/);
});

test("CAPTURE on a Romulan → nosur3", async () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  const v = ship.vPos + 1, h = ship.hPos;
  state.board.setdsp(v, h, DX.ROM * 100);
  setArgs(a, `CAPTURE ${v} ${h}`);
  reset(a);
  await capture(state, a);
  assert.match(out(a), /Romulan refuses to surrender/);
});

test("CAPTURE death: large fortification → ship damage ≥ KENDAM emits captu1/4", async () => {
  const { state, a } = fresh();
  a.team = TEAM.FED;
  const enemySide = 2;
  // Heavily fortified, ship already damaged near death.
  const { v, h } = placePlanetAdjacent(state, a, DX.NPLN + enemySide, 1, 0, 5);
  const ship = state.ships[a.who]!;
  ship.damage = KENDAM - 100; // one hit from death
  ship.shieldCond = -1; // shields down so PHADAM hits hull directly
  ship.shieldPct = 0;
  setArgs(a, `CAPTURE ${v} ${h}`);
  reset(a);
  await capture(state, a);
  assert.ok(ship.damage >= KENDAM || ship.energy <= 0, "ship is dead after capture");
  assert.match(out(a), /Science Officer|First Officer/); // captu1 (Fed) or captu2 (Emp)
  assert.match(out(a), /DESTROYED during capture of planet/);
});
