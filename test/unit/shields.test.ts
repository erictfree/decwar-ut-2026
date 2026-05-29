// SPDX-License-Identifier: GPL-3.0-or-later
// Original DECWAR (FORTRAN/MACRO-10, 1979): Copyright (c) 1979, 2011 Bob Hysick, Jeff Potter, The University of Texas Computation Center, and Harris Newman
// TypeScript port: Copyright (c) 2026 The University of Texas at Austin, Department of Arts and Entertainment Technologies

/**
 * SHIELDS — UP / DOWN / TRANSFER. Source-pinned DECWAR.FOR:3722–3786; strings MSG.MAC:280–289.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInitialGameState } from "../../src/core/state.ts";
import { createSession } from "../../src/core/session.ts";
import { activate } from "../../src/lifecycle/activate.ts";
import { shields } from "../../src/commands/shields.ts";
import { tokenize } from "../../src/parser/tokenizer.ts";
import { Rng } from "../../src/core/rng.ts";
import { ScriptedIo } from "../harness/scriptedIo.ts";
import { DEV, KCRIT, SHIELD, COND, ENERGY_CAP, SHIELD_CAP } from "../../src/core/constants.ts";
import type { GameState } from "../../src/core/state.ts";
import type { Session } from "../../src/core/session.ts";

function fresh(scripted: string[] = []): { state: GameState; a: Session } {
  const state = createInitialGameState(new Rng(1));
  const a = createSession(new ScriptedIo(scripted));
  activate(state, a);
  return { state, a };
}
const out = (s: Session): string => (s.io as ScriptedIo).output;
const reset = (s: Session): void => { (s.io as ScriptedIo).output = ""; };
const setArgs = (s: Session, line: string): void => {
  s.tokens = tokenize(line, 0).tokens;
};

test("SHIELDS UP raises shields, costs 100 energy (×10 → 1000), emits shld06", async () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  ship.shieldCond = SHIELD.DOWN;
  const e0 = ship.energy;
  setArgs(a, "SHIELDS UP");
  reset(a);
  await shields(state, a);
  assert.equal(ship.shieldCond, SHIELD.UP);
  assert.equal(ship.energy, e0 - 1000);
  assert.match(out(a), /Shields raised/);
});

test("SHIELDS UP refused when KDSHLD device damage > KCRIT", async () => {
  const { state, a } = fresh();
  state.devices[a.who]![DEV.KDSHLD] = KCRIT + 1;
  state.ships[a.who]!.shieldCond = SHIELD.DOWN;
  setArgs(a, "SHIELDS UP");
  reset(a);
  await shields(state, a);
  assert.equal(state.ships[a.who]!.shieldCond, SHIELD.DOWN, "shields stay down");
  assert.match(out(a), /unable to raise shields due to critical damage/);
});

test("SHIELDS DOWN drops shields with no energy cost, emits shld08", async () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  ship.shieldCond = SHIELD.UP;
  const e0 = ship.energy;
  setArgs(a, "SHIELDS DOWN");
  reset(a);
  await shields(state, a);
  assert.equal(ship.shieldCond, SHIELD.DOWN);
  assert.equal(ship.energy, e0, "no energy cost");
  assert.match(out(a), /Shields lowered/);
});

test("SHIELDS UP cuts an active tractor beam on both ends", async () => {
  const { state, a } = fresh();
  // Manually engage a tractor: who tows partner=2; partner tows who.
  state.trstat[a.who] = 2;
  state.trstat[2] = a.who;
  state.ships[a.who]!.shieldCond = SHIELD.DOWN;
  setArgs(a, "SHIELDS UP");
  reset(a);
  await shields(state, a);
  assert.equal(state.trstat[a.who], 0);
  assert.equal(state.trstat[2], 0);
});

test("SHIELDS TRANSFER 100: 100 raw → 1000 ×10 ship energy → +40 ×10 shield-pct (1000/25)", async () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  ship.shieldPct = 0;
  const e0 = ship.energy;
  setArgs(a, "SHIELDS TRANSFER 100");
  reset(a);
  await shields(state, a);
  // senrgy = 100*10 = 1000; shield += 1000/25 = 40; energy -= 1000
  assert.equal(ship.shieldPct, 40);
  assert.equal(ship.energy, e0 - 1000);
  assert.match(out(a), /Energy transferred/);
});

test("SHIELDS TRANSFER positive caps at 100% shields (source 3751)", async () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  ship.shieldPct = SHIELD_CAP - 4; // 996 (= 99.6%) — only 4 ×10 pct points of headroom
  const e0 = ship.energy;
  setArgs(a, "SHIELDS TRANSFER 500"); // would be 5000 ×10 energy; capped to 4*25=100
  reset(a);
  await shields(state, a);
  assert.equal(ship.shieldPct, SHIELD_CAP);
  assert.equal(ship.energy, e0 - 100);
});

test("SHIELDS TRANSFER -200: drain shields to fill ship; caps at ENERGY_CAP", async () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  ship.shieldPct = 500;          // 50% → drainable up to 500*25 = 12500 ×10 energy
  ship.energy = ENERGY_CAP - 1000; // close to cap; 1000 ×10 of room
  setArgs(a, "SHIELDS TRANSFER -200"); // -2000 ×10; -senrgy=2000 < 500*25=12500 ⇒ no shield-drain cap
                                       // but energy+2000 > 50000 ⇒ caps senrgy = -(50000-49000) = -1000
  reset(a);
  await shields(state, a);
  assert.equal(ship.energy, ENERGY_CAP);
  assert.equal(ship.shieldPct, 500 + Math.trunc(-1000 / 25)); // 500 - 40 = 460
});

test("SHIELDS TRANSFER zero-energy: prompts shld03 'Confirm?'; NO → cancel with shld04", async () => {
  const { state, a } = fresh(["NO"]); // user types anything-not-YES to cancel
  const ship = state.ships[a.who]!;
  // Set up so the (possibly clamped) transfer ≥ ship energy → triggers confirm.
  ship.shieldPct = 0;
  ship.energy = 100;            // tiny energy; senrgy=1000 clamped to (1000-0)*25=25000; min(1000, 25000)=1000 ≥ 100 → confirm
  setArgs(a, "SHIELDS TRANSFER 100");
  reset(a);
  await shields(state, a);
  assert.match(out(a), /Confirm\?/);
  assert.match(out(a), /Energy NOT transferred/);
  assert.equal(ship.energy, 100, "no mutation on cancel");
  assert.equal(ship.shieldPct, 0);
});

test("SHIELDS TRANSFER zero-energy: prompts; YES → proceeds (shld05)", async () => {
  const { state, a } = fresh(["YES"]);
  const ship = state.ships[a.who]!;
  ship.shieldPct = 0;
  ship.energy = 100;
  setArgs(a, "SHIELDS TRANSFER 100");
  reset(a);
  await shields(state, a);
  assert.match(out(a), /Energy transferred/);
  // Source has NO post-confirm cap on positive transfer: senrgy=1000 (clamped only by shield
  // headroom (1000-0)*25=25000 → still 1000), shield += 1000/25 = 40, energy -= 1000 → -900.
  // The player accepted the consequence by saying YES; the loop's death-check will fire next.
  assert.equal(ship.shieldPct, 40);
  assert.equal(ship.energy, -900);
});

test("SHIELDS TRANSFER negative when shieldPct=0 caps at 0 (no shield drain available)", async () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  ship.shieldPct = 0;
  const e0 = ship.energy;
  setArgs(a, "SHIELDS TRANSFER -50");
  reset(a);
  await shields(state, a);
  assert.equal(ship.shieldPct, 0);
  assert.equal(ship.energy, e0, "nothing to drain → no energy gained");
});

test("TRANSFER setting shieldPct=0 forces shieldCond=-1 (source 3766)", async () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  ship.shieldCond = SHIELD.UP;
  ship.shieldPct = 50;
  ship.energy = 10000;            // give the ship room to receive the drain (else energy-cap suppresses)
  // Drain exactly 50 ×10 pct: -50*25 = -1250 ×10 energy. Use a -125 raw input → -1250 ×10.
  setArgs(a, "SHIELDS TRANSFER -125");
  reset(a);
  await shields(state, a);
  assert.equal(ship.shieldPct, 0);
  assert.equal(ship.shieldCond, SHIELD.DOWN);
});

test("TRANSFER condition: <1000 ×10 ship energy → YELLOW; ≥1000 → GREEN", async () => {
  const { state, a } = fresh();
  const ship = state.ships[a.who]!;
  ship.condition = COND.GREEN;
  ship.energy = 1200;            // 120 raw; transfer 50 raw → energy -= 500 → 700, < 1000 → YELLOW
  ship.shieldPct = 0;
  setArgs(a, "SHIELDS TRANSFER 50");
  reset(a);
  await shields(state, a);
  assert.equal(ship.condition, COND.YELLOW);
});
